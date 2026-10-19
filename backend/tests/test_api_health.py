def test_health(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
    from app.core.config import get_settings

    get_settings.cache_clear()

    import importlib

    import app.core.database as db_mod
    import app.main as main_mod

    importlib.reload(db_mod)
    importlib.reload(main_mod)

    from fastapi.testclient import TestClient

    app = main_mod.create_app()
    with TestClient(app) as client:
        res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("ok", "degraded")
    assert isinstance(body["version"], str) and body["version"]
    assert "gitSha" in body
