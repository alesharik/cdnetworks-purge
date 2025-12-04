import * as core from '@actions/core'
import * as crypto from 'crypto'

interface FileHeader {
  name: string
  value: string
}

interface PurgeRequest {
  fileUrls?: string[]
  dirUrls?: string[]
  regexPatterns?: string[]
  name?: string
  fileHeaders?: FileHeader[]
  action?: string
  target: string
}

interface PurgeResponse {
  purgeId: string
  status: string
  message?: string
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const apiUrl = core.getInput('api-url') || 'https://ngapi.cdnetworks.com'
    const apiUser = core.getInput('api-user', { required: true })
    const apiKey = core.getInput('api-key', { required: true })
    const domainId = core.getInput('domain-id', { required: true })
    const onBehalfOf = core.getInput('on-behalf-of')
    const name = core.getInput('name')
    const fileHeaders = core.getInput('file-headers')
    const action = core.getInput('action') || 'invalidate'
    const target = core.getInput('target', { required: true })

    const fileUrls = core.getInput('file-urls')
    const dirUrls = core.getInput('dir-urls')
    const regexPatterns = core.getInput('regex-patterns')

    if (!fileUrls && !dirUrls && !regexPatterns) {
      throw new Error(
        'At least one of file-urls, dir-urls, or regex-patterns must be provided'
      )
    }

    if (!['delete', 'invalidate'].includes(action)) {
      throw new Error(
        'action must be either "delete" or "invalidate"'
      )
    }

    if (!['staging', 'production'].includes(target)) {
      throw new Error(
        'target must be either "staging" or "production"'
      )
    }

    const purgeRequest: PurgeRequest = {
      action,
      target
    }

    if (fileUrls) {
      purgeRequest.fileUrls = fileUrls
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
    }

    if (dirUrls) {
      purgeRequest.dirUrls = dirUrls
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
    }

    if (regexPatterns) {
      purgeRequest.regexPatterns = regexPatterns
        .split('\n')
        .map((pattern) => pattern.trim())
        .filter(Boolean)
    }

    if (name) {
      purgeRequest.name = name
    }

    if (fileHeaders) {
      try {
        const parsedHeaders = JSON.parse(fileHeaders)
        if (typeof parsedHeaders === 'object' && !Array.isArray(parsedHeaders) && parsedHeaders !== null) {
          purgeRequest.fileHeaders = Object.entries(parsedHeaders).map(([name, value]) => ({
            name,
            value: String(value)
          }))
        } else {
          throw new Error('file-headers must be an object')
        }
      } catch (error) {
        throw new Error(`Invalid file-headers JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    core.info(`Initiating purge request for domain: ${domainId}`)
    core.info(`Action: ${purgeRequest.action}`)
    core.info(`Target: ${purgeRequest.target}`)
    core.info(`Files: ${purgeRequest.fileUrls?.length || 0}`)
    core.info(`Directories: ${purgeRequest.dirUrls?.length || 0}`)
    core.info(`Regex patterns: ${purgeRequest.regexPatterns?.length || 0}`)
    core.info(`File headers: ${purgeRequest.fileHeaders?.length || 0}`)

    const date = new Date().toUTCString()
    const password = generatePassword(apiKey, date)
    const auth = Buffer.from(`${apiUser}:${password}`).toString('base64')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      Date: date,
      Accept: 'application/json'
    }

    if (onBehalfOf) {
      headers['On-Behalf-Of'] = onBehalfOf
    }

    const response = await fetch(`${apiUrl}/domains/${domainId}/purge`, {
      method: 'POST',
      headers,
      body: JSON.stringify(purgeRequest)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const result: PurgeResponse = (await response.json()) as PurgeResponse

    core.info(`Purge request submitted successfully`)
    core.info(`Purge ID: ${result.purgeId}`)
    core.info(`Status: ${result.status}`)

    if (result.message) {
      core.info(`Message: ${result.message}`)
    }

    core.setOutput('purge-id', result.purgeId)
    core.setOutput('status', result.status)
    core.setOutput('message', result.message || '')

    core.summary
      .addHeading('CDNetworks Purge Request')
      .addTable([
        [
          { data: 'Property', header: true },
          { data: 'Value', header: true }
        ],
        ['Purge ID', result.purgeId],
        ['Status', result.status],
        ['Domain ID', domainId],
        ['Files', purgeRequest.fileUrls?.length?.toString() || '0'],
        ['Directories', purgeRequest.dirUrls?.length?.toString() || '0'],
        [
          'Regex Patterns',
          purgeRequest.regexPatterns?.length?.toString() || '0'
        ]
      ])
      .write()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(`Action failed: ${message}`)
  }
}

function generatePassword(apiKey: string, date: string): string {
  return crypto.createHmac('sha1', apiKey).update(date).digest('base64')
}
