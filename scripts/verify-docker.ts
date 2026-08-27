// 在真正裝了 Docker 的機器上跑這個腳本（例如你本機的 Docker Desktop 4.12.0），
// 驗證 DockerExecutor 的隔離真的有效——這個專案的開發/測試環境沒有 Docker，
// 所有測試都只驗證了「指令組出來的樣子對不對」，不是「隔離真的擋得住」。見
// ADR-0006、src/plugins/sandbox/docker/index.ts 的模組註解。
//
// 跑法：
//   node scripts/verify-docker.ts
//
// 第一次跑會需要下載 alpine image，之後會用 cache，很快。

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDockerExecutor } from '../src/plugins/sandbox/docker/index.ts'

async function main() {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'ai-hub-docker-verify-'))
  const executor = createDockerExecutor({ workspaceDir, image: 'alpine:3.20' })

  console.log('workspace:', workspaceDir)
  const available = await executor.isAvailable()
  console.log('isAvailable():', available)
  console.log()

  if (!available) {
    console.error('Docker 回報不可用——確認 Docker Desktop 有在跑（開啟 App，等它顯示 running）。')
    process.exit(1)
  }

  let passed = 0
  let failed = 0

  async function check(label: string, fn: () => Promise<boolean>) {
    let ok: boolean
    try {
      ok = await fn()
    } catch (err) {
      console.log(`[FAIL] ${label} — 拋出例外: ${(err as Error).message}`)
      failed++
      return
    }
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}`)
    ok ? passed++ : failed++
  }

  await check('host 寫入的檔案，容器內看得到（mount 正確）', async () => {
    writeFileSync(join(workspaceDir, 'from-host.txt'), 'hello from host')
    const result = await executor.execute({ command: 'cat', args: ['/workspace/from-host.txt'] })
    return result.stdout.trim() === 'hello from host'
  })

  await check('容器內寫入 /workspace 的檔案，host 看得到（mount 雙向）', async () => {
    const result = await executor.execute({
      command: 'sh',
      args: ['-c', 'echo "hello from container" > /workspace/from-container.txt'],
    })
    if (result.exitCode !== 0) return false
    const hostPath = join(workspaceDir, 'from-container.txt')
    return existsSync(hostPath) && readFileSync(hostPath, 'utf-8').trim() === 'hello from container'
  })

  await check('容器看不到 host 上 workspace 以外的真實目錄（容器根目錄不是 host 根目錄）', async () => {
    const result = await executor.execute({ command: 'ls', args: ['/workspace/..'] })
    // 容器內 /workspace/.. 應該解析到 image 自己的根目錄結構（bin/etc/usr...），
    // 不會是這台 host 上 workspaceDir 的真實上層目錄內容。
    return result.exitCode === 0 && result.stdout.includes('bin')
  })

  await check('網路被擋（--network none）', async () => {
    const result = await executor.execute({
      command: 'sh',
      args: ['-c', 'wget -T 3 -q -O - http://example.com > /dev/null 2>&1 || echo BLOCKED'],
    })
    return result.stdout.includes('BLOCKED') || result.exitCode !== 0
  })

  rmSync(workspaceDir, { recursive: true, force: true })

  console.log(`\n${passed} 通過，${failed} 失敗`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
