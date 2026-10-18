import pytest
from pydantic import ValidationError

from app.core.urls import validate_official_url
from app.schemas.catalog import SoftwareWrite


@pytest.mark.parametrize("url", ["javascript:alert(1)", "http://example.com", "https://localhost", "https://localhost./", "https://127.0.0.1", "https://10.1.2.3", "https://172.16.0.1", "https://192.168.1.1", "https://169.254.169.254", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://2130706433", "https://0x7f000001", "https://0177.0.0.1", "https://user:secret@example.com", "https://example.com\\@localhost", "https://example.com\n", "https://example.internal", "https://example.com:8000"])
def test_reject_unsafe_destination(url):
    with pytest.raises(ValueError):
        validate_official_url(url)


def test_valid_public_url_and_alias_deduplication():
    assert validate_official_url("https://code.visualstudio.com/download")
    software = SoftwareWrite(name="Editor", slug="editor", aliases=[" VS Code ", "vs code", "蓝色编辑器"])
    assert software.aliases == ["VS Code", "蓝色编辑器"]


def test_invalid_update_level_and_raw_svg():
    with pytest.raises(ValidationError):
        SoftwareWrite(name="Editor", slug="editor", update_level="urgent")
    with pytest.raises(ValidationError):
        SoftwareWrite(name="Editor", slug="editor", icon_url="data:image/svg+xml,<svg/>")


@pytest.mark.parametrize("field", ["tags", "purposes"])
def test_tag_and_purpose_length_matches_postgresql_columns(field):
    assert SoftwareWrite(name="Editor", slug="editor", **{field: ["x" * 80]})
    with pytest.raises(ValidationError):
        SoftwareWrite(name="Editor", slug="editor", **{field: ["x" * 81]})


def test_alias_normalization_cannot_exceed_database_column():
    with pytest.raises(ValidationError):
        SoftwareWrite(name="Editor", slug="editor", aliases=["ß" * 120])
