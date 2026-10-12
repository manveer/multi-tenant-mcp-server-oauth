"""Keep SDK configuration and usage tracking out of the developer's account."""

import os
from tempfile import TemporaryDirectory

# Set before importing the example or its SDK. The subprocess tests explicitly
# receive these values too, because an MCP stdio client forwards a limited env.
_test_configuration = TemporaryDirectory(prefix="report-demo-test-config-")
os.environ["ARCADE_WORK_DIR"] = _test_configuration.name
os.environ["ARCADE_USAGE_TRACKING"] = "0"
os.environ["ARCADE_API_KEY"] = "arc_synthetic_offline_test_key"
os.environ["ARCADE_API_URL"] = "http://127.0.0.1:9"


def pytest_unconfigure(config):
    _test_configuration.cleanup()
