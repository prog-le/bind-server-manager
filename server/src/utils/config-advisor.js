// Common BIND error patterns → Chinese fix suggestions
const ERROR_PATTERNS = [
  // Syntax errors
  { pattern: /unexpected token/i, suggestion: '语法错误：检查是否有缺少分号、括号不匹配或多余的字符', severity: 'error' },
  { pattern: /missing \{/i, suggestion: '缺少左花括号 "{"，检查配置块是否完整', severity: 'error' },
  { pattern: /missing \}/i, suggestion: '缺少右花括号 "}"，检查配置块是否正确闭合', severity: 'error' },
  { pattern: /missing ;/i, suggestion: '缺少分号 ";"，BIND 配置每条指令必须以分号结尾', severity: 'error' },
  { pattern: /unknown option/i, suggestion: '未知配置选项，检查拼写或 BIND 版本兼容性', severity: 'error' },
  { pattern: /expected/i, suggestion: '语法错误：期望的值或关键字不匹配，请检查该行的配置格式', severity: 'error' },

  // Zone file errors
  { pattern: /loading zone.*file not found/i, suggestion: 'Zone 文件不存在，检查 file 路径是否正确', severity: 'error' },
  { pattern: /no NS RRset/i, suggestion: '缺少 NS 记录，Zone 必须至少包含一条 NS 记录', severity: 'error' },
  { pattern: /has no SOA record/i, suggestion: '缺少 SOA 记录，Zone 文件必须以 SOA 记录开头', severity: 'error' },
  { pattern: /CNAME and other data/i, suggestion: 'CNAME 冲突：同一域名下 CNAME 记录不能与其他类型记录共存', severity: 'error' },
  { pattern: /out of zone/i, suggestion: '记录值超出 Zone 范围，确保记录名称属于当前 Zone', severity: 'error' },
  { pattern: /bad dotted quad/i, suggestion: 'IPv4 地址格式错误，确保每段在 0-255 之间', severity: 'error' },
  { pattern: /bad IPv6/i, suggestion: 'IPv6 地址格式错误', severity: 'error' },
  { pattern: /not a valid name/i, suggestion: '域名格式无效，检查是否包含非法字符', severity: 'error' },
  { pattern: /TTL.*too large/i, suggestion: 'TTL 值过大，建议不超过 86400（24小时）', severity: 'warning' },
  { pattern: /SOA.*serial.*lower/i, suggestion: 'SOA 序列号小于之前值，BIND 可能不会加载更新。请增大序列号', severity: 'warning' },

  // Permission errors
  { pattern: /permission denied/i, suggestion: '权限不足：BIND 进程无法读取该文件。检查文件权限和所属用户', severity: 'error' },
  { pattern: /EACCES/i, suggestion: '文件访问权限错误。确保 BIND 用户（通常为 named/bind）有读取权限', severity: 'error' },
  { pattern: /open.*no such file/i, suggestion: '文件不存在，检查配置中的路径是否正确', severity: 'error' },

  // Network/port errors
  { pattern: /address already in use/i, suggestion: '端口 53 已被占用，检查是否有其他 DNS 服务在运行', severity: 'error' },
  { pattern: /EADDRINUSE/i, suggestion: '端口被占用。使用 "ss -tlnp sport = :53" 检查占用进程', severity: 'error' },

  // Include errors
  { pattern: /include.*not found/i, suggestion: 'include 文件不存在，检查路径或创建该文件', severity: 'error' },

  // Generic
  { pattern: /error.*loading/i, suggestion: '加载配置时出错，检查配置文件语法', severity: 'error' },
  { pattern: /fatal/i, suggestion: '致命错误，BIND 无法启动。请修复配置后重试', severity: 'error' },
];

/**
 * Parse named-checkconf or named-checkzone output and provide Chinese suggestions
 * @param {string} toolOutput - Raw stderr/stdout from the check tool
 * @returns {Array<{line: number|null, severity: string, message: string, suggestion: string}>}
 */
function analyzeError(toolOutput) {
  if (!toolOutput || toolOutput.trim() === '') return [];

  const lines = toolOutput.split('\n').filter(l => l.trim());
  const results = [];

  for (const line of lines) {
    // Try to extract line number
    let lineNum = null;
    const lineMatch = line.match(/:(\d+):/);
    if (lineMatch) {
      lineNum = parseInt(lineMatch[1]);
    }

    // Match against known patterns
    let matched = false;
    for (const { pattern, suggestion, severity } of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        results.push({
          line: lineNum,
          severity,
          message: line.trim(),
          suggestion,
        });
        matched = true;
        break;
      }
    }

    // If no pattern matched, include the raw message
    if (!matched && line.trim()) {
      results.push({
        line: lineNum,
        severity: 'error',
        message: line.trim(),
        suggestion: '请根据错误信息检查配置文件对应行',
      });
    }
  }

  return results;
}

module.exports = { analyzeError, ERROR_PATTERNS };
