class badge {
    id: number;
    title: string;
    granted: string;
    condition: string;
    description: string;

    constructor(id: number, title: string, granted: string, condition: string, description: string) {
        this.id = id;
        this.title = title;
        this.granted = granted;
        this.condition = condition;
        this.description = description;
    }
}

export const items: badge[] = [
  {
    id: 1,
    title: 'Altstadtlauf 2025',
    granted: '04.05.2025',
    condition: 'Nimm am Altstadtlauf 2025 teil.',
    description: 'Du hast am Altstadtlauf 2025 teilgenommen. Gratulation!',
  },
  {
    id: 2,
    title: 'Tim\'s Kaffeejunkie',
    granted: '',
    condition: 'Kaufe einen Kaffee bei Tim\'s Café.',
    description: 'Du hast einen Kaffe bei Tims\'s gekauft.'
  },
  {
    id: 3,
    title: 'Mit!Macher',
    granted: '',
    condition: 'Informiere dich über das Mach!Mit-Haus.',
    description: 'Du hast dich beim Mach!Mit-Haus über das Angebot informiert.',
  }
]