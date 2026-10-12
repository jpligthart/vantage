import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.documents.upload import save_upload


class FakeUpload:
    def __init__(self, filename: str, data: bytes):
        self.filename = filename
        self._data = data

    async def read(self) -> bytes:
        return self._data


@pytest.mark.asyncio
async def test_rejects_invalid_type(tmp_path):
    settings = Settings(data_dir=tmp_path)
    upload = FakeUpload("evil.exe", b"MZ")
    with pytest.raises(HTTPException) as exc:
        await save_upload(upload, settings)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_accepts_pdf_magic(tmp_path):
    settings = Settings(data_dir=tmp_path)
    upload = FakeUpload("a.pdf", b"%PDF-1.4 test")
    source_id, path, typ, checksum = await save_upload(upload, settings)
    assert typ == "pdf"
    assert path.is_file()
    assert len(checksum) == 64
