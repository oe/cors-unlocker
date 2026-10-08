# Install a CI artifact

GitHub already packages each artifact as a ZIP. Extract the downloaded artifact once before installing it.

## Chrome

1. Extract the artifact.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted directory containing `manifest.json`.

Chrome does not install an unsigned extension by opening or dragging a ZIP file.

## Firefox

1. Extract the artifact.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `manifest.json` in the extracted directory.

A permanent Firefox installation requires a Mozilla-signed package.
