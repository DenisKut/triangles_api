FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование скрипта
COPY udp-task-processor.js .

# Открытие порта
EXPOSE 41234/udp

# Команда для запуска
CMD ["node", "udp-task-processor.js"]
