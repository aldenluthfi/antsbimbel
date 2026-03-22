cd antsbimbel-be
python manage.py migrate
python manage.py createsuperuser --no-input
python manage.py seed_dummy_data --tutors 100 --students 200 --schedules 1000 --requests 100
python manage.py runserver