from django.db import migrations, models


def migrate_request_data_forward(apps, schema_editor):
    Request = apps.get_model('scheduling', 'Request')

    for request_obj in Request.objects.all().iterator():
        if request_obj.new_schedule_id:
            request_obj.new_schedules.add(request_obj.new_schedule_id)

        if request_obj.extension is not None:
            request_obj.request_type = 'extension'
        elif request_obj.old_schedule_id and request_obj.new_schedule_id:
            request_obj.request_type = 'reschedule'
        elif request_obj.old_schedule_id and not request_obj.new_schedule_id:
            request_obj.request_type = 'extension'
        else:
            request_obj.request_type = 'new_schedule'

        if not request_obj.description:
            request_obj.description = 'Legacy request migrated without explicit description.'

        request_obj.save(update_fields=['request_type', 'description'])


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0015_schedule_status_autodone'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='description',
            field=models.TextField(default='Legacy request migrated without explicit description.'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='request',
            name='new_schedules',
            field=models.ManyToManyField(blank=True, related_name='new_schedule_requests', to='scheduling.schedule'),
        ),
        migrations.AddField(
            model_name='request',
            name='request_type',
            field=models.CharField(
                choices=[
                    ('new_schedule', 'New schedule'),
                    ('reschedule', 'Reschedule'),
                    ('extension', 'Extension'),
                    ('cancel', 'Cancel'),
                ],
                default='new_schedule',
                max_length=16,
            ),
        ),
        migrations.RunPython(migrate_request_data_forward, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='request',
            name='new_schedule',
        ),
    ]
