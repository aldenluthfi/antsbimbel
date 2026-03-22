import re
from datetime import date, datetime

from django.utils import timezone


SAFE_NAME_REGEX = re.compile(r'[^A-Za-z0-9._ -]+')


def to_local_datetime(value: datetime | None = None) -> datetime:
    resolved = value or timezone.now()
    if timezone.is_naive(resolved):
        return timezone.make_aware(resolved, timezone.get_current_timezone())
    return timezone.localtime(resolved)


def sanitize_drive_name(value: str, *, fallback: str = 'unknown') -> str:
    normalized = str(value or '').strip()
    if not normalized:
        return fallback

    normalized = normalized.replace('/', '-').replace('\\', '-')
    normalized = SAFE_NAME_REGEX.sub('', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized or fallback


def month_year_folder(dt: datetime) -> str:
    local_dt = to_local_datetime(dt)
    return local_dt.strftime('%m-%Y')


def date_folder(dt: datetime) -> str:
    local_dt = to_local_datetime(dt)
    return local_dt.strftime('%Y-%m-%d')


def attendance_folder_parts(*, check_time: datetime, tutor_name: str, student_name: str, schedule_id: int | str):
    month_folder = month_year_folder(check_time)
    day_folder = date_folder(check_time)
    attendance_leaf = (
        f"{sanitize_drive_name(tutor_name)}-"
        f"{sanitize_drive_name(student_name)}-"
        f"{sanitize_drive_name(str(schedule_id), fallback='no-schedule')}"
    )
    return [month_folder, 'ABSENSI', day_folder, attendance_leaf]


def report_folder_parts(target_month: date):
    month_folder = target_month.strftime('%m-%Y')
    return [month_folder, 'LAPORAN']


def report_file_name(*, target_month: date, generated_at: datetime) -> str:
    month_label = target_month.strftime('%m-%Y')
    timestamp = to_local_datetime(generated_at).strftime('%Y%m%d_%H%M%S_%f')
    return f'Laporan-{month_label}_{timestamp}.sheet'


def email_log_folder_parts(sent_at: datetime):
    local_dt = to_local_datetime(sent_at)
    return [month_year_folder(local_dt), 'EMAIL LOG', date_folder(local_dt)]


def email_log_file_name(sent_at: datetime) -> str:
    local_dt = to_local_datetime(sent_at)
    return f"{local_dt.strftime('%Y%m%d_%H%M%S_%f')}.log"
