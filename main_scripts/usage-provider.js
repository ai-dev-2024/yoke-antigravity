/**
 * Antigravity Usage Provider
 * Fetches usage quotas from the local Antigravity language server
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');

const execAsync = promisify(exec);

class AntigravityUsageProvider {
    constructor(logger = console.log) {
        this.log = logger;
        this.timeout = 8000;
        this.cachedUsage = null;
        this.lastFetch = 0;
        this.cacheTimeout = 30000; // 30 seconds
    }

    async fetch() {
        // Return cached if recent
        if (this.cachedUsage && (Date.now() - this.lastFetch) < this.cacheTimeout) {
            return this.cachedUsage;
        }

        try {
            const processInfo = await this.detectProcess();
            const ports = await this.getListeningPorts(processInfo.pid);
            const workingPort = await this.findWorkingPort(ports, processInfo.csrfToken);

            const response = await this.makeRequest(
                workingPort,
                processInfo.csrfToken,
                '/exa.language_server_pb.LanguageServerService/GetUserStatus'
            );

            const usage = this.parseUserStatus(response);
            this.cachedUsage = usage;
            this.lastFetch = Date.now();
            return usage;
        } catch (error) {
            this.log(`[AntigravityUsage] Error: ${error.message}`);
            return null;
        }
    }

    async detectProcess() {
        try {
            const { stdout } = await execAsync(
                'wmic process where "Name like \'%language_server%\'" get ProcessId,CommandLine /format:list',
                { timeout: this.timeout, maxBuffer: 10 * 1024 * 1024 }
            );

            if (!stdout || stdout.trim() === '') {
                throw new Error('Language server not detected');
            }

            const entries = stdout.split(/\r?\n\r?\n/).filter(block => block.trim());

            for (const entry of entries) {
                const lines = entry.split(/\r?\n/).filter(l => l.trim());
                let commandLine = '';
                let pid = 0;

                for (const line of lines) {
                    if (line.startsWith('CommandLine=')) {
                        commandLine = line.substring('CommandLine='.length);
                    } else if (line.startsWith('ProcessId=')) {
                        pid = parseInt(line.substring('ProcessId='.length), 10);
                    }
                }

                if (!commandLine || !pid) continue;

                const csrfToken = this.extractFlag('--csrf_token', commandLine);
                if (!csrfToken) continue;

                return { pid, csrfToken, commandLine };
            }

            throw new Error('No valid language server process found');
        } catch (error) {
            throw new Error('Failed to detect Antigravity: ' + error.message);
        }
    }

    extractFlag(flag, commandLine) {
        const patterns = [
            new RegExp(`${flag}[=\\s]+([^\\s"]+)`, 'i'),
            new RegExp(`${flag}[=\\s]+"([^"]+)"`, 'i'),
        ];

        for (const pattern of patterns) {
            const match = commandLine.match(pattern);
            if (match && match[1]) return match[1];
        }
        return undefined;
    }

    async getListeningPorts(pid) {
        try {
            const { stdout } = await execAsync(
                `netstat -ano | findstr "${pid}" | findstr "LISTENING"`,
                { timeout: this.timeout }
            );

            const ports = new Set();
            const lines = stdout.split('\n');

            for (const line of lines) {
                const match = line.match(/:(\d+)\s+[\d.:]+\s+LISTENING/);
                if (match && match[1]) {
                    ports.add(parseInt(match[1], 10));
                }
            }

            return Array.from(ports).sort((a, b) => a - b);
        } catch (error) {
            throw new Error('Failed to detect ports');
        }
    }

    async findWorkingPort(ports, csrfToken) {
        for (const port of ports) {
            try {
                await this.makeRequest(port, csrfToken, '/exa.language_server_pb.LanguageServerService/GetUnleashData');
                return port;
            } catch {
                // Try next
            }
        }
        throw new Error('No working API port found');
    }

    makeRequest(port, csrfToken, path) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'yoke',
                    ideVersion: 'unknown',
                    locale: 'en',
                },
            });

            const options = {
                hostname: '127.0.0.1',
                port: port,
                path: path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': csrfToken,
                },
                rejectUnauthorized: false,
                timeout: this.timeout,
            };

            // Try HTTPS first
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', () => {
                // Try HTTP fallback
                const httpReq = http.request({ ...options }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    });
                });
                httpReq.on('error', reject);
                httpReq.on('timeout', () => reject(new Error('Timeout')));
                httpReq.write(body);
                httpReq.end();
            });

            req.on('timeout', () => reject(new Error('Timeout')));
            req.write(body);
            req.end();
        });
    }

    parseUserStatus(response) {
        const userStatus = response.userStatus;
        if (!userStatus) {
            return { error: 'No user status', models: [] };
        }

        const modelConfigs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];

        const models = modelConfigs
            .filter(config => config.quotaInfo)
            .map(config => ({
                label: config.label,
                modelId: config.modelOrAlias?.model || config.label,
                remainingPercent: config.quotaInfo?.remainingFraction !== undefined
                    ? Math.max(0, Math.min(100, config.quotaInfo.remainingFraction * 100))
                    : 100,
                usedPercent: config.quotaInfo?.remainingFraction !== undefined
                    ? 100 - Math.max(0, Math.min(100, config.quotaInfo.remainingFraction * 100))
                    : 0,
                resetTime: config.quotaInfo?.resetTime,
            }));

        // Sort by label for consistent display
        models.sort((a, b) => a.label.localeCompare(b.label));

        const planInfo = userStatus.planStatus?.planInfo;
        const planName = planInfo?.planDisplayName || planInfo?.displayName ||
            planInfo?.productName || planInfo?.planName || 'Free';

        return {
            email: userStatus.email,
            plan: planName,
            models: models,
            updatedAt: new Date().toISOString(),
        };
    }
}

module.exports = { AntigravityUsageProvider };
