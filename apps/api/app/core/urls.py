import ipaddress
import re
from urllib.parse import urlsplit


def validate_official_url(value: str) -> str:
    """Validate stored destinations only. This application never fetches these URLs.

    A future health checker must additionally resolve DNS, reject every non-public
    answer, pin the validated address and repeat validation after every redirect.
    """
    if len(value) > 2048 or any(ord(c) < 33 for c in value) or "\\" in value:
        raise ValueError("官方地址不能包含空格、控制字符或反斜线")
    try:
        parts = urlsplit(value)
        hostname = (parts.hostname or "").rstrip(".").lower()
        port = parts.port
    except ValueError as exc:
        raise ValueError("官方地址格式无效") from exc
    if parts.scheme.lower() != "https" or not hostname:
        raise ValueError("官方地址必须使用完整的 HTTPS 地址")
    if parts.username is not None or parts.password is not None:
        raise ValueError("官方地址不能包含用户名或密码")
    if port not in (None, 443):
        raise ValueError("官方地址仅允许 HTTPS 默认端口")
    if "%" in hostname or hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".lan", ".home", ".test", ".invalid")):
        raise ValueError("官方地址不能指向本地或内部网络")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        # Reject browser-compatible alternate IPv4 forms, including octal/hex.
        if "." not in hostname or re.fullmatch(r"[0-9.]+", hostname) or all(re.fullmatch(r"(?:0x[0-9a-f]+|[0-9]+)", segment) for segment in hostname.split(".")):
            raise ValueError("官方地址必须使用公网域名或公网 IP")
        try:
            ascii_host = hostname.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise ValueError("官方域名无效") from exc
        if len(ascii_host) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", segment) for segment in ascii_host.split(".")):
            raise ValueError("官方域名无效")
    else:
        if not address.is_global:
            raise ValueError("官方地址不能指向本地、保留或内部网络")
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped and not address.ipv4_mapped.is_global:
            raise ValueError("官方地址不能指向内部网络")
    return value
