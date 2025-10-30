export class userBadge {
    id: string;
    granted: string;
    title: string;
    condition: string;
    description: string;

    constructor(id: string, title: string, granted: string, condition: string, description: string) {
        this.id = id;
        this.title = title;
        this.granted = granted;
        this.condition = condition;
        this.description = description;
    }
}