const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 41234;
server.on('message', (msg, rinfo) => {
    const trimmedMsg = msg.toString().trim();
    console.log(`Received message from ${rinfo.address}:${rinfo.port}`);
    let response;
    if (trimmedMsg === 'ping') {
        response = 'pong';
    } else {
        let tasks;
        try {
            tasks = JSON.parse(trimmedMsg);
        } catch (err) {
            console.error('Error parsing message:', err);
            return;
        } 
        if (!Array.isArray(tasks) || tasks.some(task => !Array.isArray(task) || task.length !== 3)) {
            console.error('Received tasks is not an array of arrays of three points');
            return;
        }

        const results = tasks.map(task => {
            console.log('Processing task:', task);
            if (task.length === 3) {
                const valid = isValidTriangle(task);
                console.log(`Task ${JSON.stringify(task)} is ${valid ? 'valid' : 'not valid'}`);
                if (valid) {
                    const properties = calculateTriangleProperties(task);
                    console.log(`Triangle properties: ${JSON.stringify(properties)}`);
                    return properties;
                }
            } else {
                console.error('Task is not a valid triangle:', task);
                return null;
            }
        }).filter(result => result !== null);

        response = JSON.stringify(results);
        console.log(`Sending response: ${response} to ${rinfo.address}:${rinfo.port}`);
    }
    server.send(response, rinfo.port, rinfo.address, err => {
        if (err) {
            console.error(`Error sending response to ${rinfo.address}:${rinfo.port}: ${err}`);
        } else {
            console.log(`Response sent to ${rinfo.address}:${rinfo.port}`);
        }
    });
});

function isValidTriangle(points) {
    const [A, B, C] = points;
    const AB = calculateDistance(A, B);
    const BC = calculateDistance(B, C);
    const CA = calculateDistance(C, A);
    console.log(`Distances: AB=${AB}, BC=${BC}, CA=${CA}`);
    const valid = (AB + BC > CA) && (AB + CA > BC) && (BC + CA > AB);
    console.log(`Triangle with points ${JSON.stringify(points)} is ${valid ? 'valid' : 'invalid'}`);
    return valid;
}

function calculateTriangleProperties(points) {
    const [A, B, C] = points;
    const AB = calculateDistance(A, B);
    const BC = calculateDistance(B, C);
    const CA = calculateDistance(C, A);

    const angles = calculateAngles(AB, BC, CA);
    console.log(`Angles: ${JSON.stringify(angles)}`);

    const isObtuse = angles.some(angle => angle > 90);
    console.log(`Is Obtuse: ${isObtuse}`);

    if (isObtuse) {
        const area = calculateArea(AB, BC, CA);
        console.log(`Area: ${area}`);
        return { vertices: points, angles, area };
    } else {
        return null;
    }
}

function calculateDistance(point1, point2) {
    return Math.sqrt(
        Math.pow(point2.x - point1.x, 2) +
        Math.pow(point2.y - point1.y, 2) +
        Math.pow(point2.z - point1.z, 2)
    );
}

function calculateAngles(a, b, c) {
    const angleA = Math.acos((b * b + c * c - a * a) / (2 * b * c)) * (180 / Math.PI);
    const angleB = Math.acos((a * a + c * c - b * b) / (2 * a * c)) * (180 / Math.PI);
    const angleC = 180 - angleA - angleB;
    return [angleA, angleB, angleC];
}

function calculateArea(a, b, c) {
    const s = (a + b + c) / 2;
    return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

server.on('listening', () => {
    const address = server.address();
    console.log(`Server listening on ${address.address}:${address.port}`);
});

server.bind(port);
