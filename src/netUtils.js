function isValidIpv4Address(value = '') {
  if (typeof value !== 'string') {
    return false;
  }

  const ipPattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(value)) {
    return false;
  }

  const octets = value.split('.').map(Number);
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255);
}

function subnetFromIp(ip = '') {
  if (!isValidIpv4Address(ip)) {
    return null;
  }

  const [first, second, third] = ip.split('.');
  return `${first}.${second}.${third}.0/24`;
}

module.exports = {
  isValidIpv4Address,
  subnetFromIp
};
