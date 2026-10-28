#!/usr/bin/env python3
"""Prepare the 2025 company import, preserving the original OOXML cell evidence.

This command is deliberately offline: it never selects a database or sends data.
The generated RPC payload is applied through the project's authorized connector.
Only Python's standard library is required. No customer data belongs in Git.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import re
import sys
import unicodedata
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile, is_zipfile


NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
HEADERS = (
    "RAZÃO SOCIAL", "NOME FANTASIA", "CNPJ / CPF", "NOME REPRESENTANTE",
    "MUNICÍPIO", "UF", "CELULAR", "E-MAIL", "ÁREA", "NºS MÓDULOS", "ÁREA MÓDULOS",
)
CONTROLS = {
    "source_rows": 111,
    "distinct_original_documents": 107,
    "module_identifiers": 632,
    "area_total": "9591.97",
    "missing_representative": 111,
    "missing_phone": 15,
    "missing_email": 91,
}


def _check_digits(digits: str, weights: list[int]) -> str:
    remainder = sum(int(n) * weight for n, weight in zip(digits, weights)) % 11
    return str(0 if remainder < 2 else 11 - remainder)


def valid_cpf(value: str) -> bool:
    if not re.fullmatch(r"\d{11}", value) or len(set(value)) == 1:
        return False
    first = _check_digits(value[:9], list(range(10, 1, -1)))
    second = _check_digits(value[:9] + first, list(range(11, 1, -1)))
    return value[-2:] == first + second


def valid_cnpj(value: str) -> bool:
    if not re.fullmatch(r"\d{14}", value) or len(set(value)) == 1:
        return False
    first = _check_digits(value[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    second = _check_digits(value[:12] + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return value[-2:] == first + second


def normalize_document(value: str | None, numeric: bool = False) -> dict:
    """Pad only numeric cells, and only with exactly one checksum-valid candidate.

    A failed or ambiguous checksum is evidence for review, never permission to
    manufacture a CNPJ. Exact raw digits remain available for explicit matching.
    """
    raw = value
    text = (value or "").strip()
    result = {
        "raw": raw, "digits": None, "normalized": None,
        "type": "unknown", "status": "missing", "candidates": [],
    }
    if not text:
        return result
    if numeric:
        try:
            number = Decimal(text)
            if not number.is_finite() or number < 0 or number != number.to_integral_value():
                raise InvalidOperation
            digits = format(number, "f").split(".", 1)[0]
        except InvalidOperation:
            return {**result, "status": "invalid_numeric_value"}
    elif re.fullmatch(r"[0-9\s./-]+", text):
        digits = re.sub(r"[^0-9]", "", text)
    else:
        return {**result, "status": "invalid_characters"}
    result["digits"] = digits
    candidates = []
    for length, doc_type, validate in [(11, "cpf", valid_cpf), (14, "cnpj", valid_cnpj)]:
        if len(digits) == length or (numeric and 0 < len(digits) < length):
            candidate = digits.zfill(length)
            if validate(candidate):
                candidates.append({"type": doc_type, "value": candidate})
    result["candidates"] = candidates
    if len(candidates) == 1:
        candidate = candidates[0]
        result.update(
            normalized=candidate["value"], type=candidate["type"],
            status="valid" if candidate["value"] == digits else "restored_leading_zero",
        )
    elif len(candidates) > 1:
        result["status"] = "ambiguous"
    else:
        result["status"] = "invalid_checksum" if len(digits) in (11, 14) else "unresolved_length"
    return result


def _text(cell: dict | None) -> str | None:
    if not cell or cell["value"] is None:
        return None
    value = unicodedata.normalize("NFC", cell["value"]).strip()
    return value or None


def parse_decimal(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    text = value.strip().replace("\u00a0", "").replace(" ", "")
    # The source uses Brazilian text decimals and invariant OOXML numeric cells.
    if "," in text:
        if not re.fullmatch(r"-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+", text):
            raise ValueError(f"Invalid decimal: {value!r}")
        text = text.replace(".", "").replace(",", ".")
    if not re.fullmatch(r"-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?", text):
        raise ValueError(f"Invalid decimal: {value!r}")
    number = Decimal(text)
    if number < 0 or not number.is_finite():
        raise ValueError("Area must be a finite non-negative decimal")
    return format(number, "f")


def read_ooxml(path: Path, selected_sheet: str | None = None) -> tuple[str, list[tuple[int, dict]]]:
    if not is_zipfile(path):
        raise ValueError("The input content is not an OOXML ZIP workbook; no extension-based conversion attempted")
    try:
        with ZipFile(path) as archive:
            required = {"[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"}
            if not required.issubset(archive.namelist()):
                raise ValueError("ZIP content is not an Excel OOXML workbook")
            if any(item.file_size > 20_000_000 for item in archive.infolist()):
                raise ValueError("Unexpected oversized workbook part")
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            sheets = workbook.findall("x:sheets/x:sheet", NS)
            matches = [sheet for sheet in sheets if selected_sheet is None or sheet.attrib["name"] == selected_sheet]
            if len(matches) != 1:
                raise ValueError("Select exactly one worksheet with --sheet; the workbook has " + ", ".join(s.attrib["name"] for s in sheets))
            sheet = matches[0]
            relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            relation = next(rel for rel in relationships if rel.attrib["Id"] == sheet.attrib[f"{{{REL}}}id"])
            if relation.attrib.get("TargetMode") == "External":
                raise ValueError("External worksheets are not supported")
            target = relation.attrib["Target"]
            sheet_path = target.lstrip("/") if target.startswith("/") else str(PurePosixPath("xl") / target)
            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                shared = ["".join(t.text or "" for t in item.findall(".//x:t", NS)) for item in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
            rows = []
            for row in ET.fromstring(archive.read(sheet_path)).findall("x:sheetData/x:row", NS):
                cells = {}
                for cell in row.findall("x:c", NS):
                    column = re.sub(r"[0-9]+$", "", cell.attrib["r"])
                    value_node = cell.find("x:v", NS)
                    raw = value_node.text if value_node is not None else None
                    cell_type = cell.attrib.get("t", "n")
                    value = shared[int(raw)] if cell_type == "s" and raw is not None else raw
                    if cell_type == "inlineStr":
                        value = "".join(t.text or "" for t in cell.findall(".//x:t", NS))
                    item = {"value": value, "cell_type": cell_type, "raw_value": raw, "style": cell.attrib.get("s")}
                    formula = cell.find("x:f", NS)
                    if formula is not None:
                        item["formula"] = formula.text or ""
                    cells[column] = item
                rows.append((int(row.attrib["r"]), cells))
            return sheet.attrib["name"], rows
    except (BadZipFile, ET.ParseError, KeyError, StopIteration) as exc:
        raise ValueError(f"Malformed OOXML workbook: {exc}") from exc


def prepare(path: Path, selected_sheet: str | None = None) -> tuple[dict, dict]:
    sheet_name, source_rows = read_ooxml(path, selected_sheet)
    if not source_rows:
        raise ValueError("Workbook has no rows")
    header_row, header_cells = source_rows[0]
    mapping = {_text(cell): column for column, cell in header_cells.items() if _text(cell)}
    missing = set(HEADERS) - mapping.keys()
    if missing:
        raise ValueError("Missing expected headers: " + ", ".join(sorted(missing)))
    rows, ignored_empty_rows = [], []
    for source_row, cells in source_rows[1:]:
        if all(_text(cell) is None and "formula" not in cell for cell in cells.values()):
            ignored_empty_rows.append(source_row)
            continue
        source = {header: cells.get(column, {"value": None, "cell_type": "blank", "raw_value": None, "style": None}) for header, column in mapping.items()}
        # Preserve populated cells outside the header range too, rather than discard.
        for column, cell in cells.items():
            if column not in mapping.values() and _text(cell):
                source[f"__unmapped_{column}"] = cell
        value = lambda header: _text(source.get(header))
        document_cell = source["CNPJ / CPF"]
        original_document = document_cell["value"]
        document = normalize_document(original_document, numeric=document_cell["cell_type"] == "n")
        issues = []
        if document["status"] not in ("valid", "restored_leading_zero"):
            issues.append({"code": "document_" + document["status"], "field": "CNPJ / CPF", "candidates": document["candidates"]})
        elif document["status"] == "restored_leading_zero":
            issues.append({"code": "document_leading_zero_restored", "field": "CNPJ / CPF"})
        for field in ("RAZÃO SOCIAL", "NOME FANTASIA", "ÁREA"):
            if not value(field):
                issues.append({"code": "required_field_missing", "field": field})
        for field, cell in source.items():
            if "formula" in cell:
                issues.append({"code": "cached_formula_value", "field": field})
        modules_value = value("NºS MÓDULOS")
        modules = [part.strip() for part in (modules_value or "").split(";") if part.strip()]
        if modules_value and any(not part.strip() for part in modules_value.split(";")):
            issues.append({"code": "empty_module_token", "field": "NºS MÓDULOS"})
        if len(modules) != len(set(modules)):
            issues.append({"code": "repeated_module_code_in_row", "field": "NºS MÓDULOS"})
        try:
            area_total = parse_decimal(value("ÁREA MÓDULOS"))
            if area_total is None:
                issues.append({"code": "missing_area", "field": "ÁREA MÓDULOS"})
        except ValueError:
            area_total = None
            issues.append({"code": "invalid_area", "field": "ÁREA MÓDULOS"})
        snapshot = {
            "legal_name": value("RAZÃO SOCIAL"), "trade_name": value("NOME FANTASIA"),
            "tax_id": document["normalized"] or document["digits"] or value("CNPJ / CPF"),
            "email": value("E-MAIL"), "phone": value("CELULAR"), "city": value("MUNICÍPIO"),
            "state": value("UF"), "representative_name": value("NOME REPRESENTANTE"),
            "street": None, "address_number": None, "neighborhood": None, "postal_code": None,
        }
        rows.append({
            "source_row": source_row, "source_values": source, "source_document_raw": original_document,
            "document_normalized": document["normalized"], "document_type": document["type"],
            "document_status": document["status"], "snapshot": snapshot,
            "occupation": {"area_label": value("ÁREA"), "module_codes": modules, "area_total": area_total},
            "issues": issues,
        })
    checks = {
        "source_rows": len(rows),
        "distinct_original_documents": len({row["source_document_raw"] for row in rows}),
        "module_identifiers": sum(len(row["occupation"]["module_codes"]) for row in rows),
        "area_total": format(sum((Decimal(row["occupation"]["area_total"] or "0") for row in rows), Decimal("0")), ".2f"),
        "missing_representative": sum(row["snapshot"]["representative_name"] is None for row in rows),
        "missing_phone": sum(row["snapshot"]["phone"] is None for row in rows),
        "missing_email": sum(row["snapshot"]["email"] is None for row in rows),
    }
    groups = defaultdict(list)
    for row in rows:
        # A reviewed fallback key preserves invalid source identities, without merging by name.
        key = row["document_normalized"] or row["snapshot"]["tax_id"] or f"source-row:{row['source_row']}"
        groups[key].append(row)
    snapshot_conflicts = []
    for grouped in groups.values():
        if len(grouped) > 1:
            fields = [field for field in grouped[0]["snapshot"] if len({json.dumps(r["snapshot"][field], ensure_ascii=False) for r in grouped}) > 1]
            if fields:
                snapshot_conflicts.append({"source_rows": [r["source_row"] for r in grouped], "fields": fields})
    source_hash = sha256(path.read_bytes()).hexdigest()
    payload = {"p_file_sha256": source_hash, "p_source_name": path.name, "p_rows": rows}
    report = {
        "source_sha256": source_hash, "content_format": "Excel OOXML", "worksheet": sheet_name,
        "header_row": header_row, "ignored_fully_empty_rows": ignored_empty_rows,
        "controls": checks, "expected": CONTROLS,
        "reconciliation_passed": checks == CONTROLS,
        "control_differences": {key: {"expected": expected, "actual": checks[key]} for key, expected in CONTROLS.items() if checks[key] != expected},
        "document_groups": len(groups), "multiple_occupation_groups": [
            {"source_rows": [row["source_row"] for row in group], "occupations": len(group)}
            for group in groups.values() if len(group) > 1
        ],
        "document_status_counts": dict(sorted(Counter(row["document_status"] for row in rows).items())),
        "document_type_counts": dict(sorted(Counter(row["document_type"] for row in rows).items())),
        "issue_counts": dict(sorted(Counter(issue["code"] for row in rows for issue in row["issues"]).items())),
        "rows_requiring_document_review": [row["source_row"] for row in rows if row["document_status"] not in ("valid", "restored_leading_zero")],
        "different_snapshots_in_same_document": snapshot_conflicts,
        "area_labels": dict(sorted(Counter(row["occupation"]["area_label"] for row in rows).items(), key=lambda pair: str(pair[0]))),
        "database_applied": False,
    }
    return payload, report


def write_outputs(output: Path, payload: dict, report: dict) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for filename, data in [("stage-company-import.json", payload), ("reconciliation.json", report)]:
        target = output / filename
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        target.chmod(0o600)
    # Fully executable in an authenticated SQL context with the required permission.
    # Delimiter is data-derived and checked; no shell interpolation or secret handling.
    delimiter = "$indumoveis_" + payload["p_file_sha256"][:12] + "$"
    rows_json = json.dumps(payload["p_rows"], ensure_ascii=False, separators=(",", ":"))
    if delimiter in rows_json:
        raise ValueError("Unexpected SQL dollar delimiter in source")
    literal = lambda value: "'" + value.replace("'", "''") + "'"
    sql = (
        "-- Private customer data. Do not commit this file.\n"
        "-- Stage all source rows. The returned batch id is required by apply_company_import.\n"
        "select public.stage_company_import(\n"
        f"  p_file_sha256 => {literal(payload['p_file_sha256'])},\n"
        f"  p_source_name => {literal(payload['p_source_name'])},\n"
        f"  p_rows => {delimiter}{rows_json}{delimiter}::jsonb\n);\n"
    )
    sql_path = output / "stage-company-import.sql"
    sql_path.write_text(sql, encoding="utf-8")
    sql_path.chmod(0o600)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--sheet")
    parser.add_argument("--output", type=Path, default=Path("artifacts/import-2025.local"))
    args = parser.parse_args(argv)
    try:
        payload, report = prepare(args.source, args.sheet)
        write_outputs(args.output, payload, report)
    except (OSError, ValueError) as exc:
        print(f"Preparation failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Prepared private payload: {args.output / 'stage-company-import.json'}")
    print("Database not modified. Apply and verify through the authorized project connection.")
    return 0 if report["reconciliation_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
