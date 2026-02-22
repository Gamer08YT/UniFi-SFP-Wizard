export interface APIRequest {
    type: "httpRequest";
    id: string;
    timestamp: number;
    method: "GET" | "POST";
    path: string;
    headers: {};
}

export class APIReceive {
}