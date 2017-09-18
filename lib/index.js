/* @flow */

import Path from 'path'
import { CompositeDisposable, Range, TextEditor } from 'atom'
import { exec, findCached, findCachedAsync } from 'atom-linter'
import { shouldTriggerAutocomplete } from 'atom-autocomplete'
import {
  INIT_MESSAGE,
  RECHECKING_MESSAGE,
  injectPosition,
  toStatusLinterMessages,
  toCoverageLinterMessages,
  toAutocompleteSuggestions,
} from './helpers'
import CoverageView from './coverage-view'
import type { CoverageObject } from './types'

const spawnedServers: Set<string> = new Set()
const defaultFlowFile = Path.resolve(__dirname, '..', 'vendor', '.flowconfig')
const defaultFlowBinLocation = 'node_modules/.bin/flow'

export default {
  activate() {
    // eslint-disable-next-line global-require
    require('atom-package-deps').install('ide-flowtype-coverage', true)

    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(atom.config.observe('ide-flowtype-coverage.executablePath', (executablePath) => {
      this.executablePath = executablePath
    }))
    this.subscriptions.add(atom.config.observe('ide-flowtype-coverage.onlyIfAppropriate', (onlyIfAppropriate) => {
      this.onlyIfAppropriate = onlyIfAppropriate
    }))

    this.hyperclickPriority = null
    let restartNotification
    this.subscriptions.add(atom.config.observe('ide-flowtype-coverage.hyperclickPriority', (hyperclickPriority) => {
      if (this.hyperclickPriority != null) {
        if (hyperclickPriority !== this.hyperclickPriority && restartNotification === undefined) {
          restartNotification = atom.notifications.addSuccess('Restart atom to update ide-flowtype-coverage priority?', {
            dismissable: true,
            buttons: [{
              text: 'Restart',
              onDidClick: () => atom.restartApplication(),
            }],
          })
          restartNotification.onDidDismiss(() => { restartNotification = undefined })
        }
      }
      this.hyperclickPriority = hyperclickPriority
    }))
    this.subscriptions.add(atom.config.observe('ide-flowtype-coverage.showUncovered', (showUncovered) => {
      this.showUncovered = showUncovered
      // lint again so that the coverage actually updates
      const view = atom.views.getView(atom.workspace.getActiveTextEditor())
      if (view) {
        atom.commands.dispatch(view, 'linter:lint')
      }
    }))
    this.subscriptions.add(atom.workspace.onDidChangeActivePaneItem((item: ?TextEditor): void => {
      if (this.coverageView) {
        const coverage = this.coverages.get(item)
        if (coverage) {
          this.coverageView.update(coverage)
        } else {
          this.coverageView.reset()
        }
      }
    }))

    this.coverages = new WeakMap()
  },

  async getExecutablePath(fileDirectory: string): Promise<string> {
    return (
      this.executablePath ||
      await findCachedAsync(fileDirectory, defaultFlowBinLocation) ||
      'flow'
    )
  },

  deactivate() {
    this.subscriptions.dispose()
    spawnedServers.forEach((rootDirectory) => {
      const executable = this.executablePath || findCached(rootDirectory, defaultFlowBinLocation) || 'flow'
      exec(executable, ['stop'], {
        cwd: rootDirectory,
        timeout: 60 * 1000,
        detached: true,
        ignoreExitCode: true,
      }).catch(() => null) // <-- ignore all errors
    })
  },

  provideLinter(): Object[] {
    return [this.provideCoverageLinter()]
  },

  provideCoverageLinter(): Object {
    const linter = {
      name: 'Flow Coverage',
      scope: 'file',
      grammarScopes: ['source.js', 'source.js.jsx'],
      lintsOnChange: false,
      lint: async (textEditor: TextEditor) => {
        let configFile
        const filePath = textEditor.getPath()
        const fileDirectory = Path.dirname(filePath)

        if (this.onlyIfAppropriate) {
          configFile = await findCachedAsync(fileDirectory, '.flowconfig')
          if (!configFile) {
            return []
          }
        }

        const executable = await this.getExecutablePath(fileDirectory)

        let result: string
        try {
          result = await exec(executable, ['coverage', filePath, '--json'], {
            cwd: fileDirectory,
            timeout: 60 * 1000,
            uniqueKey: 'ide-flowtype-coverage-coverage',
            ignoreExitCode: true,
          })
          if (result === null) {
            return null
          }
        } catch (error) {
          if (error.message.indexOf(INIT_MESSAGE) !== -1 && configFile) {
            spawnedServers.add(Path.dirname(configFile))
          }
          if (error.message.indexOf(INIT_MESSAGE) !== -1 || error.message.indexOf(RECHECKING_MESSAGE) !== -1) {
            return linter.lint(textEditor)
          } else if (error.code === 'ENOENT') {
            throw new Error('Unable to find `flow` executable.')
          } else {
            throw error
          }
        }

        const coverage: CoverageObject = JSON.parse(result)
        this.coverages.set(textEditor, coverage)
        if (this.coverageView) {
          this.coverageView.update(coverage)
        }
        return this.showUncovered ? toCoverageLinterMessages(coverage) : []
      },
    }
    return linter
  },

  consumeStatusBar(statusBar: any): void {
    this.coverageView = new CoverageView()
    this.coverageView.initialize()
    this.statusBar = statusBar.addLeftTile({ item: this.coverageView, priority: 10 })
  },
}
