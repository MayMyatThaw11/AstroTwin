import os

os.environ["ASTROTWIN_NO_WARM"] = "1"  # tests start the app many times; skip the startup cache warm-up
