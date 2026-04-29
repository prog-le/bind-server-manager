// Generate BIND zone file content from DB records

function generateZoneFile(zoneName, records, zone = {}) {
  const defaultTTL = zone.default_ttl || 3600;
  const primaryNS = zone.soa_primary_ns || 'ns1.' + zoneName;
  const adminEmail = zone.soa_admin_email || 'admin.' + zoneName;
  const refresh = zone.soa_refresh || 3600;
  const retry = zone.soa_retry || 900;
  const expire = zone.soa_expire || 604800;
  const minimum = zone.soa_minimum || 86400;
  const serial = generateSerial(zone.soa_serial);

  let content = '';

  // Header
  content += `$ORIGIN ${zoneName.endsWith('.') ? zoneName : zoneName + '.'}\n`;
  content += `$TTL ${defaultTTL}\n`;
  content += `@   IN  SOA ${primaryNS.endsWith('.') ? primaryNS : primaryNS + '.'} ${adminEmail.endsWith('.') ? adminEmail : adminEmail + '.'} (\n`;
  content += `        ${serial.padEnd(12)} ; serial (YYYYMMDDNN)\n`;
  content += `        ${String(refresh).padEnd(12)} ; refresh\n`;
  content += `        ${String(retry).padEnd(12)} ; retry\n`;
  content += `        ${String(expire).padEnd(12)} ; expire\n`;
  content += `        ${String(minimum).padEnd(12)} ; minimum TTL\n`;
  content += `)\n\n`;

  // Group records by type
  const byType = {};
  for (const rec of records) {
    if (!byType[rec.type]) byType[rec.type] = [];
    byType[rec.type].push(rec);
  }

  // Ensure at least one NS record exists (BIND requires it)
  if (!byType.NS || byType.NS.length === 0) {
    byType.NS = [{ name: '@', type: 'NS', value: primaryNS, ttl: defaultTTL }];
  }

  // NS records first
  if (byType.NS) {
    for (const rec of byType.NS) {
      content += formatRecord(rec, 'NS');
    }
    content += '\n';
  }

  // A records
  if (byType.A) {
    for (const rec of byType.A) {
      content += formatRecord(rec, 'A');
    }
    content += '\n';
  }

  // AAAA records
  if (byType.AAAA) {
    for (const rec of byType.AAAA) {
      content += formatRecord(rec, 'AAAA');
    }
    content += '\n';
  }

  // MX records
  if (byType.MX) {
    for (const rec of byType.MX) {
      content += formatMXRecord(rec);
    }
    content += '\n';
  }

  // CNAME records
  if (byType.CNAME) {
    for (const rec of byType.CNAME) {
      content += formatRecord(rec, 'CNAME');
    }
    content += '\n';
  }

  // TXT records
  if (byType.TXT) {
    for (const rec of byType.TXT) {
      content += formatTXTRecord(rec);
    }
    content += '\n';
  }

  // SRV records
  if (byType.SRV) {
    for (const rec of byType.SRV) {
      content += formatSRVRecord(rec);
    }
    content += '\n';
  }

  // CAA records
  if (byType.CAA) {
    for (const rec of byType.CAA) {
      content += formatCAARecord(rec);
    }
    content += '\n';
  }

  // PTR records
  if (byType.PTR) {
    for (const rec of byType.PTR) {
      content += formatRecord(rec, 'PTR');
    }
    content += '\n';
  }

  return content;
}

function formatRecord(rec, type) {
  const name = rec.name === '@' ? '@' : rec.name;
  const ttl = rec.ttl ? ` ${rec.ttl}` : '';
  // A/AAAA records are IP addresses — no trailing dot; others are hostnames — need FQDN dot
  const needsDot = type !== 'A' && type !== 'AAAA';
  const value = (!needsDot || rec.value.endsWith('.')) ? rec.value : rec.value + '.';
  return `${name.padEnd(16)}${ttl.padEnd(8)}IN  ${type.padEnd(8)}${value}\n`;
}

function formatMXRecord(rec) {
  const name = rec.name === '@' ? '@' : rec.name;
  const ttl = rec.ttl ? ` ${rec.ttl}` : '';
  const value = rec.value.endsWith('.') ? rec.value : rec.value + '.';
  return `${name.padEnd(16)}${ttl.padEnd(8)}IN  MX      ${rec.priority || 10} ${value}\n`;
}

function formatTXTRecord(rec) {
  const name = rec.name === '@' ? '@' : rec.name;
  const ttl = rec.ttl ? ` ${rec.ttl}` : '';
  const value = rec.value.startsWith('"') ? rec.value : `"${rec.value}"`;
  return `${name.padEnd(16)}${ttl.padEnd(8)}IN  TXT     ${value}\n`;
}

function formatSRVRecord(rec) {
  const name = rec.name === '@' ? '@' : rec.name;
  const ttl = rec.ttl ? ` ${rec.ttl}` : '';
  const value = rec.value.endsWith('.') ? rec.value : rec.value + '.';
  return `${name.padEnd(16)}${ttl.padEnd(8)}IN  SRV     ${rec.priority || 0} ${rec.weight || 0} ${rec.port || 0} ${value}\n`;
}

// CAA records must NOT have a trailing dot on the value
function formatCAARecord(rec) {
  const name = rec.name === '@' ? '@' : rec.name;
  const ttl = rec.ttl ? ` ${rec.ttl}` : '';
  // CAA value is like: 0 issue "letsencrypt.org" — no trailing dot
  return `${name.padEnd(16)}${ttl.padEnd(8)}IN  CAA     ${rec.value}\n`;
}

// Generate serial number in YYYYMMDDNN format
// If currentSerial is provided, auto-increment: same day → bump NN, new day → reset to 01
function generateSerial(currentSerial) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayPrefix = `${year}${month}${day}`;

  if (currentSerial && typeof currentSerial === 'string' && currentSerial.length >= 8) {
    const existingPrefix = currentSerial.substring(0, 8);
    if (existingPrefix === todayPrefix) {
      // Same day: increment the NN suffix
      const nn = parseInt(currentSerial.substring(8), 10) || 0;
      return `${todayPrefix}${String(nn + 1).padStart(2, '0')}`;
    }
    // Cross-day: check if new date is ahead
    if (todayPrefix > existingPrefix) {
      return `${todayPrefix}01`;
    }
    // Current serial is somehow in the future — still increment
    const nn = parseInt(currentSerial.substring(8), 10) || 0;
    return `${existingPrefix}${String(nn + 1).padStart(2, '0')}`;
  }

  return `${todayPrefix}01`;
}

module.exports = { generateZoneFile, generateSerial };
