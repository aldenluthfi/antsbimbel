from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0003_schedule_check_in'),
    ]

    operations = [
        migrations.AlterField(
            model_name='checkin',
            name='check_in_photo',
            field=models.URLField(max_length=2048),
        ),
        migrations.AlterField(
            model_name='checkout',
            name='check_out_photo',
            field=models.URLField(max_length=2048),
        ),
    ]
