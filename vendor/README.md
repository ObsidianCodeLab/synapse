# Vendor Python wheels

Internal wheels required for Synapse desktop/release packaging but not published to PyPI.

| File | Purpose |
|------|---------|
| `foundation-1.0.7-py3-none-any.whl` | WhaleCloud `foundation.helper.CryptHelper` — encrypts `data/userinfo.encryption` for Dev Cloud login |

Release and local PyInstaller builds install this wheel before `build/build_backend.py` runs. Do not remove or rename without updating `build/build_backend.py` and CI workflows.
