// Gives a file a custom Finder icon and hides its extension. These live on the file on this Mac rather than in Git,
// so the launcher applies them to itself.
// Used as: osascript -l JavaScript scripts/finder-look.js <file> <icon.png>
ObjC.import('AppKit')

// oxlint-disable-next-line no-unused-vars -- osascript calls this
function run([file, icon]) {
  const image = $.NSImage.alloc.initWithContentsOfFile(icon)
  $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, file, 0)
  const hidden = $.NSDictionary.dictionaryWithObjectForKey($.NSNumber.numberWithBool(true), 'NSFileExtensionHidden')
  $.NSFileManager.defaultManager.setAttributesOfItemAtPathError(hidden, file, null)
}
