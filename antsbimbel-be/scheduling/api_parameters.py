from drf_spectacular.utils import OpenApiParameter, OpenApiTypes


LIST_QUERY_PARAMETERS = [
    OpenApiParameter(
        name='tutor',
        description='Filter by tutor user id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='student',
        description='Filter by student primary key id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='start_date',
        description='Start of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='end_date',
        description='End of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='status',
        description='Filter by schedule status. Allowed: upcoming, done, autodone, missed, cancelled, rescheduled, extended, pending, rejected. Supports repeated query params (?status=upcoming&status=extended) or comma-separated values (?status=upcoming,extended).',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='sort_by',
        description='Schedule sort field. Allowed: start_datetime, end_datetime, status.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='sort_order',
        description='Sort direction. Allowed: asc, desc. Defaults to desc.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
]

LIST_PAGINATION_QUERY_PARAMETERS = [
    OpenApiParameter(
        name='page',
        description='Page number.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='page_size',
        description='Results per page (max 100).',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
]

SCHEDULE_LIST_QUERY_PARAMETERS = [*LIST_QUERY_PARAMETERS, *LIST_PAGINATION_QUERY_PARAMETERS]

REQUEST_LIST_QUERY_PARAMETERS = [
    OpenApiParameter(
        name='tutor',
        description='Filter by tutor user id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='student',
        description='Filter by student primary key id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='start_date',
        description='Start of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='end_date',
        description='End of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='status',
        description='Filter by request status. Allowed: pending, resolved. Supports repeated query params (?status=pending&status=resolved) or comma-separated values (?status=pending,resolved).',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='sort_by',
        description='Request sort field. Allowed: created_at, start_datetime, end_datetime, status.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='sort_order',
        description='Sort direction. Allowed: asc, desc. Defaults to desc.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    *LIST_PAGINATION_QUERY_PARAMETERS,
]

REQUEST_CALENDAR_PAGINATION_QUERY_PARAMETERS = [
    OpenApiParameter(
        name='tutor',
        description='Filter by tutor user id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='student',
        description='Filter by student primary key id.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='start_date',
        description='Start of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='end_date',
        description='End of date range. Use YYYY-MM-DD.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='status',
        description='Filter by request status. Allowed: pending, resolved. Supports repeated query params (?status=pending&status=resolved) or comma-separated values (?status=pending,resolved).',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='mode',
        description='Calendar mode. Allowed: month, week. Defaults to month.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='cursor_date',
        description='Reference date in YYYY-MM-DD. Defaults to today.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
]

CALENDAR_PAGINATION_QUERY_PARAMETERS = [
    *LIST_QUERY_PARAMETERS,
    OpenApiParameter(
        name='mode',
        description='Calendar mode. Allowed: month, week. Defaults to month.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='cursor_date',
        description='Reference date in YYYY-MM-DD. Defaults to today.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
]

USER_LIST_QUERY_PARAMETERS = [
    OpenApiParameter(
        name='search',
        description='Case-insensitive search text for list results.',
        required=False,
        type=OpenApiTypes.STR,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='page',
        description='Page number.',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
    OpenApiParameter(
        name='page_size',
        description='Results per page (max 100).',
        required=False,
        type=OpenApiTypes.INT,
        location=OpenApiParameter.QUERY,
    ),
]
