from django.db import migrations, models


def forward_convert_student_references(apps, schema_editor):
    Student = apps.get_model('scheduling', 'Student')
    Schedule = apps.get_model('scheduling', 'Schedule')
    CheckIn = apps.get_model('scheduling', 'CheckIn')

    student_code_to_id = {
        (student.student_id or '').strip(): student.id
        for student in Student.objects.only('id', 'student_id')
    }

    def resolve_student_id(raw_value):
        normalized = str(raw_value or '').strip()
        if not normalized:
            return None
        if normalized in student_code_to_id:
            return student_code_to_id[normalized]
        if normalized.isdigit():
            return int(normalized)
        return None

    unresolved_values = set()

    for schedule in Schedule.objects.only('id', 'student_id').iterator(chunk_size=500):
        resolved = resolve_student_id(schedule.student_id)
        if resolved is None:
            unresolved_values.add(str(schedule.student_id))
            continue
        if str(schedule.student_id) != str(resolved):
            schedule.student_id = resolved
            schedule.save(update_fields=['student_id'])

    for check_in in CheckIn.objects.only('id', 'student_id').iterator(chunk_size=500):
        resolved = resolve_student_id(check_in.student_id)
        if resolved is None:
            unresolved_values.add(str(check_in.student_id))
            continue
        if str(check_in.student_id) != str(resolved):
            check_in.student_id = resolved
            check_in.save(update_fields=['student_id'])

    if unresolved_values:
        examples = ', '.join(sorted(unresolved_values)[:10])
        raise RuntimeError(
            'Cannot convert some student_id values to numeric Student.id values. '
            f'Examples: {examples}'
        )


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0004_google_drive_photo_urls'),
    ]

    operations = [
        migrations.RunPython(forward_convert_student_references, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='checkin',
            name='student_id',
            field=models.BigIntegerField(),
        ),
        migrations.AlterField(
            model_name='schedule',
            name='student_id',
            field=models.BigIntegerField(),
        ),
        migrations.RemoveField(
            model_name='student',
            name='student_id',
        ),
        migrations.AlterModelOptions(
            name='student',
            options={'ordering': ('id',)},
        ),
    ]
