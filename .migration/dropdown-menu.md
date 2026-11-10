# dropdown-menu

2026-11-11, golden pair via cli, migrated to shadcn base-rhea.

## changed

- `components.json:3` configures base-rhea, the neutral theme, outfit, and remix icons from preset `b27Gdzo8`.
- `src/components/ui/dropdown-menu.tsx:1` replaces the previous custom radix wrapper with the cli-generated base ui component.
- `src/components/ui/context-menu.tsx:1` supplies the row's right-click behavior.
- `src/FileActionMenu.tsx:1` shares actions across the dropdown and context menu.
- `src/LibraryFilters.tsx:1` preserves badge toggles and resets the last deselection.
- `src/SourcePicker.tsx:1` uses shadcn select with colored tag values.
- `src/TagFields.tsx:1` uses shadcn popover for the color palette.
- `src/WorkspaceSettings.tsx:1`, `src/FilePeek.tsx:1`, and `src/CodeEditor.tsx:1` use shadcn dialog so nested menus and focus management share the same primitive library.
- `src/styles.css:1` loads the preset, local outfit font, semantic colors, and reduced-motion behavior.
- the source and dependency scan for `radix-ui`, `@radix-ui`, and `IconPlaceholder` is clean.

## left alone

telegram storage, authentication, file artwork, and upload queue behavior belong to their existing modules.

## behavior changes

- sources use combobox and option semantics.
- menus use base ui keyboard navigation, outside dismissal, and focus restoration.
- checkbox filters explicitly stay open on activation.
- file peek uses a solid dialog and its standard transition.
- fullscreen image and video controls remain available through the same actions.
- modal dialogs hide the background from assistive technology.
- the app keeps its existing subtle focus highlights.

## verify by hand

- open the three-dot menu with the keyboard and return focus with escape.
- right-click a row, copy its link, and edit its code.
- open settings, choose a source, and apply a colored tag.
- open the palette and close it with escape.
- open a file preview and then its code editor.
- open image and video previews on desktop and iphone.
- inspect settings and file peek at 320 px and with reduced motion.
