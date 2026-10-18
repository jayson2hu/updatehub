import io
import uuid
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.catalog import CatalogService

MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def save_icon(file: UploadFile, db: Session, admin_id: str):
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "图标不能超过 2 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"}:
                    raise ValueError("unsupported image format")
                if source.width > 2048 or source.height > 2048:
                    raise ValueError("image dimensions too large")
                source.load()
                clean = source.convert("RGBA")
                clean.thumbnail((512, 512))
                # Re-encode pixel data only; SVG, scripts and uploaded metadata never survive.
                output = io.BytesIO()
                clean.save(output, format="PNG")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(422, "请选择有效的 PNG、JPEG 或 WebP 图片，尺寸不超过 2048 × 2048") from exc
    filename = f"{uuid.uuid4().hex}.png"
    path = get_settings().upload_dir / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(output.getvalue())
    service = CatalogService(db)
    service.audit(admin_id, "upload", "icon", filename[:32], after={"url": f"/uploads/{filename}"})
    try:
        service.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return f"/uploads/{filename}"
