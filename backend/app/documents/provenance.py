import json
from typing import Any


def bbox_to_normalized_dict(bbox: Any, page_height: float | None) -> dict[str, float] | None:
    if bbox is None:
        return None
    try:
        if page_height is not None and hasattr(bbox, "to_top_left_origin"):
            bbox = bbox.to_top_left_origin(page_height=page_height)
        if hasattr(bbox, "normalized") and hasattr(bbox, "as_tuple"):
            return {
                "l": float(bbox.l),
                "t": float(bbox.t),
                "r": float(bbox.r),
                "b": float(bbox.b),
            }
        if hasattr(bbox, "l"):
            return {"l": float(bbox.l), "t": float(bbox.t), "r": float(bbox.r), "b": float(bbox.b)}
    except (TypeError, ValueError, AttributeError):
        return None
    return None


def bbox_to_json(bbox: Any, page_height: float | None) -> str | None:
    data = bbox_to_normalized_dict(bbox, page_height)
    return json.dumps(data) if data else None
