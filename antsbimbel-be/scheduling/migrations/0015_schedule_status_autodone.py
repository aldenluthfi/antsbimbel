from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0014_request_extension_and_extended_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='schedule',
            name='status',
            field=models.CharField(
                choices=[
                    ('upcoming', 'Upcoming'),
                    ('done', 'Done'),
                    ('autodone', 'Autodone'),
                    ('missed', 'Missed'),
                    ('cancelled', 'Cancelled'),
                    ('rescheduled', 'Rescheduled'),
                    ('extended', 'Extended'),
                    ('pending', 'Pending'),
                    ('rejected', 'Rejected'),
                ],
                default='upcoming',
                max_length=16,
            ),
        ),
    ]
