"""Simple credential store that mimics DPAPI-protected storage using XOR obfuscation."""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict


@dataclass(slots=True)
class Credential:
    username: str
    password: str


class CredentialStore:
    """Stores credentials in a JSON file with lightweight reversible obfuscation.

    The goal is to mimic the DPAPI-backed behaviour described in the PRD while
    remaining cross-platform inside the coding environment. Secrets are XORed
    with a device specific key derived from an environment seed.
    """

    def __init__(self, file_path: Path) -> None:
        self._path = file_path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._key = self._derive_key()
        if not self._path.exists():
            self._write({})

    def _derive_key(self) -> bytes:
        seed = os.environ.get("APP_SECRET_SEED", "baedal-control-seed")
        return seed.encode("utf-8")

    def _encode(self, text: str) -> str:
        data = text.encode("utf-8")
        key = self._key
        xored = bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])
        return base64.urlsafe_b64encode(xored).decode("ascii")

    def _decode(self, cipher: str) -> str:
        data = base64.urlsafe_b64decode(cipher.encode("ascii"))
        key = self._key
        plain = bytes([b ^ key[i % len(key)] for i, b in enumerate(data)])
        return plain.decode("utf-8")

    def _read(self) -> Dict[str, Dict[str, str]]:
        return json.loads(self._path.read_text(encoding="utf-8"))

    def _write(self, data: Dict[str, Dict[str, str]]) -> None:
        self._path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def save(self, cred_id: str, credential: Credential) -> None:
        data = self._read()
        data[cred_id] = {
            "username": self._encode(credential.username),
            "password": self._encode(credential.password),
        }
        self._write(data)

    def load(self, cred_id: str) -> Credential:
        data = self._read()
        row = data[cred_id]
        return Credential(username=self._decode(row["username"]), password=self._decode(row["password"]))
