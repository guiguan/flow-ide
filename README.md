This is a **temp solution** to make flowtype([ide-flowtype](https://github.com/flowtype/ide-flowtype)) of Atom IDE supports flow coverage report. It is based on `steelbrain`'s
Atom package [ide-flow](https://github.com/steelbrain/flow-ide).

To enable it:
1. Install `ide-flowtype-coverage` via `apm` or Atom preferences
2. Specify `flow` path in `Executable Path`

The update of the coverage in status bar is triggered when saving a file. The coverage report will
be shown in Atom IDE's Diagnostics. To temporarily disable coverage, click on status bar
`Flow Coverage: ?%`, and save the file. To re-enable it, click on status bar
`Flow Coverage: ?%`, and save the file.

Enjoy!
