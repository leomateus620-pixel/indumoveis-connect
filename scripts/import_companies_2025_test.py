"""Synthetic fixtures only: production documents and contacts must never enter Git."""

from decimal import Decimal
import json
from pathlib import Path
import tempfile
import unittest
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from import_companies_2025 import HEADERS, normalize_document, parse_decimal, prepare, read_ooxml, valid_cnpj, valid_cpf, write_outputs


def workbook_fixture(path: Path, records: list[dict]) -> None:
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    sheet = ET.Element("worksheet", xmlns=ns)
    data = ET.SubElement(sheet, "sheetData")
    headers = ET.SubElement(data, "row", r="1")
    for i, name in enumerate(HEADERS):
        cell = ET.SubElement(headers, "c", r=f"{chr(65 + i)}1", t="inlineStr")
        ET.SubElement(ET.SubElement(cell, "is"), "t").text = name
    for index, record in enumerate(records, 2):
        row = ET.SubElement(data, "row", r=str(index))
        for column, name in enumerate(HEADERS):
            if name not in record:
                continue
            value = record[name]
            numeric = isinstance(value, (int, float))
            cell = ET.SubElement(row, "c", r=f"{chr(65 + column)}{index}", t="n" if numeric else "inlineStr")
            if numeric:
                ET.SubElement(cell, "v").text = str(value)
            else:
                ET.SubElement(ET.SubElement(cell, "is"), "t").text = str(value)
    empty = ET.SubElement(data, "row", r=str(len(records) + 2))
    ET.SubElement(empty, "c", r=f"K{len(records) + 2}", s="1")
    with ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        archive.writestr("xl/workbook.xml", f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Test" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", ET.tostring(sheet, encoding="utf-8"))


class DocumentNormalizationTest(unittest.TestCase):
    def test_cpf_and_cnpj_identification_with_punctuation(self):
        self.assertEqual(normalize_document("529.982.247-25")["normalized"], "52998224725")
        self.assertEqual(normalize_document("04.252.011/0001-10")["type"], "cnpj")

    def test_only_uniquely_valid_numeric_padding_is_restored(self):
        document = normalize_document("4252011000110", numeric=True)
        self.assertEqual((document["normalized"], document["status"]), ("04252011000110", "restored_leading_zero"))
        self.assertEqual(document["raw"], "4252011000110")
        self.assertEqual(normalize_document("4252011000110")["normalized"], None)
        cpf = normalize_document("1234567890", numeric=True)
        self.assertEqual((cpf["type"], cpf["normalized"]), ("cpf", "01234567890"))

    def test_ambiguous_cpf_cnpj_is_never_guessed(self):
        document = normalize_document("191", numeric=True)
        self.assertEqual(document["status"], "ambiguous")
        self.assertIsNone(document["normalized"])
        self.assertEqual(len(document["candidates"]), 2)

    def test_invalid_digits_do_not_become_identifiers(self):
        for value in ("11111111111", "00000000000000", "52998224724", "04252011000111"):
            self.assertIsNone(normalize_document(value, numeric=True)["normalized"])
        self.assertFalse(valid_cpf("11111111111"))
        self.assertFalse(valid_cnpj("00000000000000"))
        self.assertEqual(normalize_document("123.5", numeric=True)["status"], "invalid_numeric_value")
        self.assertEqual(normalize_document("NaN", numeric=True)["status"], "invalid_numeric_value")
        self.assertEqual(normalize_document("12x34")["status"], "invalid_characters")

    def test_scientific_notation_preserves_original_value(self):
        document = normalize_document("4.252011000110E+12", numeric=True)
        self.assertEqual(document["normalized"], "04252011000110")
        self.assertEqual(document["raw"], "4.252011000110E+12")


class SourcePreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "fixture.xls"
        self.record = {
            "RAZÃO SOCIAL": "Empresa de teste Ltda", "NOME FANTASIA": "Empresa de teste",
            "CNPJ / CPF": 4252011000110, "MUNICÍPIO": "Município de teste", "UF": "RS",
            "ÁREA": "MOSTRA  ARQ&DESIGN", "NºS MÓDULOS": "001; 002; A-03", "ÁREA MÓDULOS": "61,99",
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_content_detection_does_not_trust_xls_extension(self):
        workbook_fixture(self.path, [self.record])
        name, rows = read_ooxml(self.path)
        self.assertEqual(name, "Test")
        self.assertEqual(len(rows), 3)
        self.path.write_bytes(b"not a workbook")
        with self.assertRaisesRegex(ValueError, "not an OOXML"):
            read_ooxml(self.path)

    def test_repeated_company_preserves_each_occupation_and_raw_cells(self):
        second = {**self.record, "ÁREA": "ÁREA EXTERNA ESPECIAL", "NºS MÓDULOS": "007", "ÁREA MÓDULOS": 25}
        workbook_fixture(self.path, [self.record, second])
        payload, report = prepare(self.path)
        self.assertEqual(len(payload["p_rows"]), 2)
        self.assertEqual(report["document_groups"], 1)
        self.assertEqual(report["multiple_occupation_groups"], [{"source_rows": [2, 3], "occupations": 2}])
        self.assertEqual(report["controls"]["module_identifiers"], 4)
        self.assertEqual(report["controls"]["area_total"], "86.99")
        self.assertEqual(payload["p_rows"][0]["occupation"]["module_codes"], ["001", "002", "A-03"])
        self.assertEqual(payload["p_rows"][0]["source_values"]["CNPJ / CPF"]["cell_type"], "n")
        self.assertEqual(payload["p_rows"][0]["source_document_raw"], "4252011000110")
        self.assertEqual(report["ignored_fully_empty_rows"], [4])

    def test_missing_data_stays_absent_and_controls_fail_loudly(self):
        workbook_fixture(self.path, [self.record])
        payload, report = prepare(self.path)
        snapshot = payload["p_rows"][0]["snapshot"]
        for field in ("representative_name", "phone", "email", "street", "address_number", "neighborhood", "postal_code"):
            self.assertIsNone(snapshot[field])
        self.assertFalse(report["reconciliation_passed"])
        self.assertEqual(report["control_differences"]["source_rows"]["actual"], 1)

    def test_decimal_area_is_total_not_quantity_times_area(self):
        workbook_fixture(self.path, [self.record])
        payload, report = prepare(self.path)
        self.assertEqual(payload["p_rows"][0]["occupation"]["area_total"], "61.99")
        self.assertEqual(report["controls"]["area_total"], "61.99")
        self.assertEqual(Decimal(parse_decimal("9.591,97")), Decimal("9591.97"))
        self.assertEqual(parse_decimal("0"), "0")
        self.assertIsNone(parse_decimal(None))
        with self.assertRaises(ValueError):
            parse_decimal("12 m²")

    def test_bad_rows_are_retained_and_marked_for_review(self):
        bad = {**self.record, "CNPJ / CPF": "12x34", "ÁREA MÓDULOS": "unknown", "NºS MÓDULOS": "007;007;"}
        workbook_fixture(self.path, [bad])
        payload, report = prepare(self.path)
        self.assertEqual(len(payload["p_rows"]), 1)
        self.assertEqual(report["rows_requiring_document_review"], [2])
        codes = {issue["code"] for issue in payload["p_rows"][0]["issues"]}
        self.assertEqual(codes, {"document_invalid_characters", "invalid_area", "repeated_module_code_in_row", "empty_module_token"})
        self.assertEqual(payload["p_rows"][0]["occupation"]["module_codes"], ["007", "007"])

    def test_same_name_different_document_never_merges(self):
        different = {**self.record, "CNPJ / CPF": "52998224725"}
        workbook_fixture(self.path, [self.record, different])
        _, report = prepare(self.path)
        self.assertEqual(report["document_groups"], 2)

    def test_preparation_and_files_are_deterministic(self):
        workbook_fixture(self.path, [self.record])
        payload, report = prepare(self.path)
        output = Path(self.temp.name) / "out.local"
        write_outputs(output, payload, report)
        first = (output / "stage-company-import.json").read_bytes()
        write_outputs(output, *prepare(self.path))
        self.assertEqual((output / "stage-company-import.json").read_bytes(), first)
        self.assertEqual(json.loads(first)["p_file_sha256"], payload["p_file_sha256"])
        self.assertFalse(report["database_applied"])


if __name__ == "__main__":
    unittest.main()
