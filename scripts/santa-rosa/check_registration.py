"""Measure orientation from screenshot/photo feature correspondences (opencv-python-headless)."""
import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def lateral_motion(folder):
    """Track the two rendered south views after a 3.5-unit sideways translation."""
    first, last = [
        cv2.imread(str(folder / name), cv2.IMREAD_GRAYSCALE)
        for name in ("setor-S.png", "setor-S-travelling.png")
    ]
    if first is None or last is None or first.shape != (860, 1468) or first.shape != last.shape:
        raise ValueError("Both native 1468 × 860 south captures are required")
    rows = {"horizon": (170, 220), "parkForeground": (330, 620)}
    measurements = {}
    for key, (top, bottom) in rows.items():
        mask = np.zeros_like(first)
        mask[top:bottom, 70:-70] = 255
        corners = cv2.goodFeaturesToTrack(first, 1200, .014, 5, mask=mask)
        options = {"winSize": (21, 21), "maxLevel": 4}
        moved, visible, _ = cv2.calcOpticalFlowPyrLK(first, last, corners, None, **options)
        back, reversed_ok, _ = cv2.calcOpticalFlowPyrLK(last, first, moved, None, **options)
        delta = (moved - corners)[:, 0, :]
        valid = (
            (visible[:, 0] == 1)
            & (reversed_ok[:, 0] == 1)
            & (np.linalg.norm(back - corners, axis=2)[:, 0] < .9)
            & (np.abs(delta[:, 1]) < 3)
        )
        shifts = delta[valid, 0]
        if len(shifts) < 50:
            raise ValueError(f"Too few visible corners in {key}")
        measurements[key] = {
            "screenRows": [top, bottom],
            "trackedCorners": len(shifts),
            "medianHorizontalShiftPixels": float(np.median(shifts)),
        }
    near = measurements["parkForeground"]["medianHorizontalShiftPixels"]
    far = measurements["horizon"]["medianHorizontalShiftPixels"]
    assert near < 0 and far < 0 and abs(near) > 3 * abs(far)
    return measurements


def measure(screenshot):
    photograph = ROOT / "public/landscape/santa-rosa/near-detail.webp"
    photo = cv2.imread(str(photograph), cv2.IMREAD_GRAYSCALE)
    view = cv2.imread(str(screenshot), cv2.IMREAD_GRAYSCALE)
    if photo is None or view is None:
        raise ValueError("Both the north-up aerial and the rendered top view are required")

    sift = cv2.SIFT_create(nfeatures=18000, contrastThreshold=0.018)
    photo_points, photo_descriptors = sift.detectAndCompute(photo, None)
    view_points, view_descriptors = sift.detectAndCompute(view, None)
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=60))
    matches = [
        pair[0]
        for pair in matcher.knnMatch(photo_descriptors, view_descriptors, k=2)
        if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance
    ]
    start = np.float32([photo_points[m.queryIdx].pt for m in matches])
    end = np.float32([view_points[m.trainIdx].pt for m in matches])
    # Allow reflection: forcing a positive determinant would invalidate the mirror test.
    affine, inliers = cv2.estimateAffine2D(
        start, end, method=cv2.RANSAC, ransacReprojThreshold=4, maxIters=10000
    )
    if affine is None:
        raise ValueError("No coherent affine transform was found")
    good = end[inliers.ravel().astype(bool)]
    height, width = view.shape
    quadrant = (good[:, 0] > width / 2).astype(int) + 2 * (good[:, 1] > height / 2).astype(int)
    return {
        "inputSize": list(reversed(photo.shape)),
        "captureSize": [width, height],
        "matches": len(matches),
        "inliers": len(good),
        "quadrantsTopLeftTopRightBottomLeftBottomRight": np.bincount(quadrant, minlength=4).tolist(),
        "eastClockwiseDegreesFromScreenRight": math.degrees(math.atan2(affine[1, 0], affine[0, 0])) % 360,
        "determinant": float(np.linalg.det(affine[:, :2])),
        "affinePhotoPixelToScreenPixel": affine.tolist(),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("screenshot", type=Path, help="Native superior.png from the visual route test")
    screenshot = parser.parse_args().screenshot
    result = measure(screenshot)
    result["lateralMotionSceneUnits"] = 3.5
    result["lateralMotion"] = lateral_motion(screenshot.parent)
    print(json.dumps(result, indent=2))
    assert result["inliers"] >= 50
    assert min(result["quadrantsTopLeftTopRightBottomLeftBottomRight"]) > 0
    assert result["determinant"] > 0
    assert abs(result["eastClockwiseDegreesFromScreenRight"] - 119.2) < 3
