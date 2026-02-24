# <img src="https://raw.githubusercontent.com/hkitago/ColorMark/refs/heads/main/Shared%20(App)/Resources/Icon.png" height="36" valign="bottom"/> ColorMark for Safari Extension

This Safari extension lets you highlight text on web pages using your device’s built-in color picker, making it easy to mark important information as you browse. Highlights are reliably saved and restored when you reload a page or return to it later, so your notes remain available over time. When reading long pages with lots of scrolling, you can open a list of saved highlights and automatically scroll directly to their positions on the page, helping you review key sections quickly and comfortably.

Ideal for people who read and reference web content regularly, including students creating study notes, researchers tracking sources across long pages, educators preparing materials, and presenters who need to locate key points quickly. It fits naturally into workflows where the web is used as a working space, keeping highlights in place and bringing you back to them when you need them.

## Installation & Uninstallation

### Installation

To install the extension on iOS or iPadOS, go to Settings > Apps > Safari > Extensions, or enable the extension by toggling it on in the Manage Extensions option found in the Safari address bar.
For macOS, open Safari, go to Safari > Settings > Extensions, and enable the extension from there.

### Uninstallation

To uninstall the extension, similarly to the installation process, toggle the extension off, or remove it completely by selecting the extension icon on the Home Screen and choosing "Delete app".

## Usage

1. Load a web page.
2. Select the text on the web page.
3. Tap the icon next to the address bar and choose the extension. On macOS, you can also use the "ColorMark" command from the context menu.
4. A window will slide up from the bottom on iPhone, while a pop-up window will appear on iPad and Mac. You can change the default highlight color, remove highlighted items, modify their colors, or share them using the Text Fragment API with the Share Sheet API. *For reference, the highlighted items appear in the same order as the text within the web page.*

> [!IMPORTANT]
> For best results, use webpages with stable and permanent URLs. Dynamic pages or frequently changing content may affect web annotation and text fragment behavior, and highlights may not be restored correctly when revisiting the page.

## Latest Version

### [26.2] - 2026-02-20

- Resolved highlight loss caused by overlapping text selections, keeping your annotations reliably saved
- Optimized drawing and response speed to deliver a faster, more fluid experience.

Previous Updates: [CHANGELOG.md](./CHANGELOG.md)

## Compatibility

- iOS/iPadOS 16.6+
- macOS 12.4+

## License

This project is open-source and available under the [MIT License](LICENSE). Feel free to use and modify it as needed.

## Contact

You can reach me via [email](mailto:hkitago@icloud.com?subject=Support%20for%20ColorMark).

## Additional Information

### Related Links
- App Store: [ColorMark for Safari on the App Store](https://apps.apple.com/app/id6740665007)
- [Get extensions to customize Safari on iPhone - Apple Support](https://support.apple.com/guide/iphone/iphab0432bf6/18.0/ios/18.0)
- [Get extensions to customize Safari on Mac - Apple Support](https://support.apple.com/guide/safari/get-extensions-sfri32508/mac)
- [Use Safari extensions on your Mac – Apple Support](https://support.apple.com/102343)
- Privacy Policy Page: [Privacy Policy – hkitago software dev](https://hkitago.com/wpautoterms/privacy-policy/)
- Support Page: [hkitago/ColorMark](https://github.com/hkitago/ColorMark/)
