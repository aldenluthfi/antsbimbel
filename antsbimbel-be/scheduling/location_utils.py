import re
from urllib.parse import quote


def build_location_search_url(location):
    normalized = str(location or '').strip()
    if not normalized:
        return 'https://www.google.com'

    coordinate_match = re.match(r'^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$', normalized)
    if coordinate_match:
        latitude = coordinate_match.group(1)
        longitude = coordinate_match.group(2)
        return f'https://www.google.com/maps/search/?api=1&query={quote(f"{latitude},{longitude}")}'

    return f'https://www.google.com/search?q={quote(normalized)}'