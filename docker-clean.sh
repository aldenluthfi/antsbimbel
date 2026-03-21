docker rm $(docker ps -a -q) -f
docker rmi $(docker images -a -q) -f
docker volume rm $(docker volume ls -q) -f
docker network rm $(docker network ls -q) -f

docker system prune -a -f --volumes