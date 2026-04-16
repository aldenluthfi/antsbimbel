from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scheduling', '0016_refactor_request_grouping_and_description'),
    ]

    operations = [
        migrations.AlterField(
            model_name='request',
            name='description',
            field=models.TextField(),
        ),
    ]
