#!/usr/bin/env bash
set -euo pipefail

# Pin official releases so local runs and CI use the same native browser.
firefox_version=157.0.1
geckodriver_version=0.37.1
test_browser_dir=${1:?Usage: install-firefox-test-browser.sh /absolute/install/directory}
mkdir -p "$test_browser_dir"
curl --fail --location --retry 3 \
  "https://download.mozilla.org/?product=firefox-${firefox_version}-ssl&os=linux64&lang=en-US" \
  --output "$test_browser_dir/firefox.tar.xz"
curl --fail --location --retry 3 \
  "https://github.com/mozilla/geckodriver/releases/download/v${geckodriver_version}/geckodriver-v${geckodriver_version}-linux64.tar.gz" \
  --output "$test_browser_dir/geckodriver.tar.gz"
tar -xf "$test_browser_dir/firefox.tar.xz" -C "$test_browser_dir"
tar -xf "$test_browser_dir/geckodriver.tar.gz" -C "$test_browser_dir"
"$test_browser_dir/firefox/firefox" --version
"$test_browser_dir/geckodriver" --version
