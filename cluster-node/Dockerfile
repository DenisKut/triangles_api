# Используем базовый образ Node.js
FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование скрипта
COPY udp-task-processor.js .

# Устанавливаем переменные окружения 

RUN npm install dotenv
# Открытие порта
EXPOSE 41234/udp

# Команда для запуска
CMD ["node", "udp-task-processor.js"]
