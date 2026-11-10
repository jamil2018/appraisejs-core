"""Separate fixed composition allocation. Shares original Popen/wait/retention gates, never launches at import."""
import importlib.util
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("service_fresh_driver", Path(__file__).with_name("custody-service-fresh-driver.py"))
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
COMPOSITION = ["original-nonstart-authored-analysis-composition16z"]


def main():
    driver.require_admission(len(sys.argv) == 3, "DRIVER_ARGUMENT_COUNT")
    proposal = driver.verify_operations(Path(sys.argv[1]), sys.argv[2], selected=COMPOSITION,
        scope="EXACT_SERVICE_COMPOSITION16Z_OS_PARENT_AND_INPUTS", driver_filename=__file__)
    driver.supervise_original_controller(proposal, selected=COMPOSITION)


if __name__ == "__main__":
    main()
