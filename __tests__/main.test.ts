/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { wait } from '../__fixtures__/wait.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/wait.js', () => ({ wait }))

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Set the action's inputs as return values from core.getInput().
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'api-user': 'test-user',
        'api-key': 'test-key',
        'domain-id': 'test-domain',
        'target': 'staging',
        'file-urls': 'https://example.com/file1.txt',
        'action': 'invalidate'
      }
      return inputs[name] || ''
    })

    // Mock fetch to return successful response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        purgeId: 'test-purge-id-123',
        status: 'pending',
        message: 'Purge request submitted'
      })
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Sets the purge outputs', async () => {
    await run()

    // Verify the purge-id output was set.
    expect(core.setOutput).toHaveBeenCalledWith('purge-id', 'test-purge-id-123')
    expect(core.setOutput).toHaveBeenCalledWith('status', 'pending')
    expect(core.setOutput).toHaveBeenCalledWith('message', 'Purge request submitted')
  })

  it('Sets a failed status for invalid action', async () => {
    // Mock getInput to return invalid action
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'api-user': 'test-user',
        'api-key': 'test-key',
        'domain-id': 'test-domain',
        'target': 'staging',
        'file-urls': 'https://example.com/file1.txt',
        'action': 'invalid-action'
      }
      return inputs[name] || ''
    })

    await run()

    // Verify that the action was marked as failed.
    expect(core.setFailed).toHaveBeenCalledWith(
      'Action failed: action must be either "delete" or "invalidate"'
    )
  })
})
