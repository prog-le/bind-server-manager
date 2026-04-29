// DNS record validation rules

const IPv4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPv6_REGEX = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,7}:$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
const HOSTNAME_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const RELATIVE_NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidIPv4(ip) {
  if (!IPv4_REGEX.test(ip)) return false;
  return ip.split('.').every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

function isValidIPv6(ip) {
  return IPv6_REGEX.test(ip);
}

function isValidHostname(name) {
  // Allow relative names (ending with .) or full hostnames
  return HOSTNAME_REGEX.test(name) || RELATIVE_NAME_REGEX.test(name);
}

// Validate record name field
// Accepts: @, hostname labels, *, *.subdomain
// Rejects: www.*, **, *., empty, .leading-dot
const RECORD_NAME_REGEX = /^(@|\*$|\*\.[a-zA-Z0-9][a-zA-Z0-9.-]*|[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;

function validateRecordName(name) {
  if (!name || typeof name !== 'string') return '请输入记录名称';
  name = name.trim();
  if (name === '') return '请输入记录名称';
  if (!RECORD_NAME_REGEX.test(name)) {
    return '记录名称格式无效。请使用 @（根域名）、主机名、*（泛域名）或 *.子域名';
  }
  return null; // valid
}

function validateRecord(type, value, priority, weight, port, ttl) {
  const errors = [];

  // TTL validation (optional — only if provided)
  if (ttl !== undefined && ttl !== null && ttl !== '') {
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 86400) {
      errors.push('TTL 必须是 60 到 86400 之间的整数');
    }
  }

  switch (type) {
    case 'A':
      if (!isValidIPv4(value)) {
        errors.push('无效的 IPv4 地址');
      }
      break;

    case 'AAAA':
      if (!isValidIPv6(value)) {
        errors.push('无效的 IPv6 地址');
      }
      break;

    case 'CNAME':
    case 'NS':
      if (isValidIPv4(value) || isValidIPv6(value)) {
        errors.push(`${type} 记录的值必须是主机名，不能是 IP 地址`);
      } else if (!isValidHostname(value)) {
        errors.push('无效的主机名');
      }
      break;

    case 'MX':
      if (priority === undefined || priority === null) {
        errors.push('MX 记录需要指定优先级');
      } else if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
        errors.push('MX 优先级必须是 0 到 65535 之间的整数');
      }
      if (!isValidHostname(value)) {
        errors.push('MX 目标必须是有效的主机名');
      }
      break;

    case 'SRV':
      if (priority === undefined || priority === null) {
        errors.push('SRV 记录需要指定优先级');
      } else if (!Number.isInteger(priority) || priority < 0 || priority > 65535) {
        errors.push('SRV 优先级必须是 0 到 65535 之间的整数');
      }
      if (weight === undefined || weight === null) {
        errors.push('SRV 记录需要指定权重');
      } else if (!Number.isInteger(weight) || weight < 0 || weight > 65535) {
        errors.push('SRV 权重必须是 0 到 65535 之间的整数');
      }
      if (port === undefined || port === null) {
        errors.push('SRV 记录需要指定端口');
      } else if (!Number.isInteger(port) || port < 0 || port > 65535) {
        errors.push('SRV 端口必须是 0 到 65535 之间的整数');
      }
      if (!isValidHostname(value)) {
        errors.push('SRV 目标必须是有效的主机名');
      }
      break;

    case 'TXT':
      // TXT records accept any text
      if (typeof value !== 'string') {
        errors.push('TXT 值必须是字符串');
      }
      break;

    case 'CAA':
      // CAA format: flags tag value
      // e.g., 0 issue "letsencrypt.org"
      if (!value.match(/^\d+\s+(issue|issuewild|iodef)\s+"[^"]+"$/)) {
        errors.push('CAA 格式：<flags> <tag> "<value>"（例如：0 issue "letsencrypt.org"）');
      }
      break;

    case 'PTR':
      if (!isValidHostname(value)) {
        errors.push('PTR 目标必须是有效的主机名');
      }
      break;

    case 'SOA':
      // SOA is auto-generated, not user-editable — accept silently
      break;

    default:
      errors.push(`未知的记录类型：${type}`);
  }

  return errors;
}

// ─── Hostname helpers ─────────────────────────────────────────

// Ensure a hostname ends with a trailing dot (absolute FQDN)
function ensureTrailingDot(name) {
  if (!name) return name;
  return name.endsWith('.') ? name : name + '.';
}

// Normalize hostname: strip trailing dot for DB storage (relative name)
function normalizeHostname(name) {
  if (!name) return name;
  return name.endsWith('.') ? name.slice(0, -1) : name;
}

// ─── Zone-level NS/SOA validation (RFC 1034/1912/2181) ────────

/**
 * Validate all NS records in a zone.
 * @param {Array} records - All records in the zone
 * @param {string} zoneName - The zone name (e.g., "example.com")
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateZoneRecords(records, zoneName) {
  const errors = [];
  const warnings = [];

  const nsRecords = records.filter(r => r.type === 'NS');
  const cnameRecords = records.filter(r => r.type === 'CNAME');
  const aRecords = records.filter(r => r.type === 'A');
  const aaaaRecords = records.filter(r => r.type === 'AAAA');
  const soaRecords = records.filter(r => r.type === 'SOA');

  // 1. SOA required
  // SOA is auto-generated in zone file header, not stored as a record — skip this check

  // 2. NS count: 2 ≤ count ≤ 7
  if (nsRecords.length < 2) {
    errors.push(`Zone 至少需要 2 条 NS 记录（当前 ${nsRecords.length} 条）。RFC 1912 §4。`);
  }
  if (nsRecords.length > 7) {
    errors.push(`Zone 不能超过 7 条 NS 记录（当前 ${nsRecords.length} 条）。RFC 1912 §4。`);
  }

  // Helper: resolve a record name to its zone-relative form for comparison
  // e.g., "ns1" + "example.com" → "ns1.example.com", "@" + "example.com" → "example.com"
  function toFqdn(name, zone) {
    if (name === '@' || name === '') return zone;
    return name + '.' + zone;
  }

  // 3. Each NS record validation
  for (const ns of nsRecords) {
    const nsValue = normalizeHostname(ns.value);

    // 3a. NS value must be a hostname, not an IP
    if (isValidIPv4(nsValue) || isValidIPv6(nsValue)) {
      errors.push(`NS 记录 "${ns.name}" 的值是 IP 地址（${nsValue}）。NS 值必须是主机名，不能是 IP。RFC 1034。`);
      continue; // Skip further checks for this record
    }

    // 3b. NS value must be a valid hostname
    if (!isValidHostname(nsValue)) {
      errors.push(`NS 记录 "${ns.name}" 的主机名值无效："${nsValue}"。`);
      continue;
    }

    // 3c. NS target cannot be a CNAME
    const isCname = cnameRecords.some(c => toFqdn(c.name, zoneName) === nsValue);
    if (isCname) {
      errors.push(`NS 记录 "${ns.name}" 指向了 CNAME 记录 "${nsValue}"。NS 不能指向 CNAME。RFC 2181 §10.3。`);
    }

    // 3d. NS target must have A/AAAA record (warning if missing)
    const hasA = aRecords.some(a => toFqdn(a.name, zoneName) === nsValue);
    const hasAAAA = aaaaRecords.some(a => toFqdn(a.name, zoneName) === nsValue);
    if (!hasA && !hasAAAA) {
      // Check if NS points to a subdomain of this zone or external
      const isSubdomain = nsValue.endsWith('.' + zoneName) || nsValue === zoneName;
      if (isSubdomain) {
        errors.push(`NS 记录 "${ns.name}" 指向的 "${nsValue}" 在本 Zone 中没有 A/AAAA 记录。`);
      } else {
        warnings.push(`NS 记录 "${ns.name}" 指向的 "${nsValue}" 在本 Zone 中没有 A/AAAA 记录。请确保该 NS 主机名可解析。`);
      }
    }
  }

  // 4. NS A/AAAA IPs must be unique (no duplicate IPs across NS servers)
  const nsIps = [];
  for (const ns of nsRecords) {
    const nsValue = normalizeHostname(ns.value);
    const matchingA = aRecords.filter(a => toFqdn(a.name, zoneName) === nsValue);
    const matchingAAAA = aaaaRecords.filter(a => toFqdn(a.name, zoneName) === nsValue);
    for (const a of matchingA) nsIps.push({ ns: ns.name, ip: a.value });
    for (const a of matchingAAAA) nsIps.push({ ns: ns.name, ip: a.value });
  }
  const ipCounts = {};
  for (const entry of nsIps) {
    if (!ipCounts[entry.ip]) ipCounts[entry.ip] = [];
    ipCounts[entry.ip].push(entry.ns);
  }
  for (const [ip, nss] of Object.entries(ipCounts)) {
    if (nss.length > 1) {
      warnings.push(`多条 NS 记录（${nss.join(', ')}）解析到相同的 IP：${ip}。建议使用不同的服务器以提高冗余性。`);
    }
  }

  return { errors, warnings };
}

module.exports = {
  isValidIPv4,
  isValidIPv6,
  isValidHostname,
  validateRecord,
  validateRecordName,
  validateZoneRecords,
  ensureTrailingDot,
  normalizeHostname,
};
