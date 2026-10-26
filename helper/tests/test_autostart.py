"""Tests voor de autostart-installer (XDG .desktop-entry)."""

from tts_lnx_helper import autostart


def test_install_schrijft_desktop_file(tmp_path, monkeypatch):
    monkeypatch.setattr(autostart, "AUTOSTART_DIR", tmp_path)
    autostart.install()
    content = (tmp_path / "tts-lnx-helper.desktop").read_text()
    assert "Exec=tts-lnx-helper" in content
    assert "X-GNOME-Autostart-enabled=true" in content


def test_uninstall_verwijdert_desktop_file(tmp_path, monkeypatch):
    monkeypatch.setattr(autostart, "AUTOSTART_DIR", tmp_path)
    autostart.install()
    autostart.uninstall()
    assert not (tmp_path / "tts-lnx-helper.desktop").exists()


def test_uninstall_zonder_bestand_gooit_niet(tmp_path, monkeypatch):
    monkeypatch.setattr(autostart, "AUTOSTART_DIR", tmp_path)
    autostart.uninstall()  # mag geen FileNotFoundError geven
