// 在真正的 macOS 上跑這個腳本，驗證 SeatbeltExecutor 的隔離真的有效——這個專案的
// 開發/測試環境是 Linux，沒辦法自己驗證這件事，所有測試都只驗證了「指令組出來的樣子
// 對不對」，不是「隔離真的擋得住」。見 ADR-0006、src/plugins/sandbox/seatbelt/index.ts
// 的模組註解。
//
// 跑法：
//   node scripts/verify-seatbelt.ts
//
// 預期：在真正的 sandbox-exec 底下，前三項應該 PASS（能寫 workspace 內、不能寫
// workspace 外、不能碰 dotfile），第四項也應該 PASS（v1 不限制讀取）。如果任何一項
// 不是預期結果，代表 buildSeatbeltProfile() 產生的 SBPL 有問題，需要回頭修，不要
// 略過這個結果。
//
// 注意：workspaceDir 不需要自己加 /private 前綴——SeatbeltExecutor 內部會用
// fs.realpathSync() 自動解析 macOS 的 /var、/tmp 這類 symlink（見
// memory/MEM-20260821-seatbelt-realpath-fix.md，這個問題已經修過一次了）。

import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSeatbeltExecutor } from '../src/plugins/sandbox/seatbelt/index.ts'

async function main() {
  if (process.platform !== 'darwin') {
    console.error(`這個腳本只在 macOS 上有意義，目前平台是 "${process.platform}"，中止。`)
    process.exit(1)
  }

  const workspaceDir = mkdtempSync(join(tmpdir(), 'ai-hub-seatbelt-verify-'))
  const executor = createSeatbeltExecutor({ workspaceDir })

  console.log('workspace:', workspaceDir)
  console.log('isAvailable():', await executor.isAvailable())
  console.log()

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

  await check('可以寫入 workspace 內的檔案', async () => {
    const result = await executor.execute({ command: 'sh', args: ['-c', `echo hi > ${workspaceDir}/inside.txt`] })
    return result.exitCode === 0 && existsSync(join(workspaceDir, 'inside.txt'))
  })

  const outsideFile = join(tmpdir(), `ai-hub-seatbelt-verify-outside-${Date.now()}.txt`)
  await check('不能寫入 workspace 外的檔案', async () => {
    const result = await executor.execute({ command: 'sh', args: ['-c', `echo hi > ${outsideFile}`] })
    return result.exitCode !== 0 && !existsSync(outsideFile)
  })
  if (existsSync(outsideFile)) rmSync(outsideFile) // 如果隔離沒生效，清掉這個測試殘留的檔案

  await check('不能寫入家目錄的 dotfile（例如 .zshrc）', async () => {
    const result = await executor.execute({
      command: 'sh',
      args: ['-c', 'echo "# ai-hub sandbox test — should never appear" >> ~/.zshrc_ai_hub_verify_test'],
    })
    return result.exitCode !== 0
  })

  // 不依賴任何特定 OS 內建檔案（例如 /etc/hostname，Linux 上一定有、macOS 上不一定）
  // ——自己在 workspace 外建一個檔案，驗證 v1 的「讀取不限制」設計。
  const readableOutsideFile = join(tmpdir(), `ai-hub-seatbelt-verify-readable-${Date.now()}.txt`)
  writeFileSync(readableOutsideFile, 'readable content\n')
  await check('可以讀取 workspace 外的檔案（v1 不限制讀取，見已知限制）', async () => {
    const result = await executor.execute({ command: 'cat', args: [readableOutsideFile] })
    return result.exitCode === 0 && result.stdout.trim() === 'readable content'
  })
  rmSync(readableOutsideFile)

  console.log(`\n${passed} 通過，${failed} 失敗`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
