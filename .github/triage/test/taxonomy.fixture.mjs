export const taxonomy = {
  levels: [
    { name: 'Estagiário', aliases: ['Estagiária', 'Estágio', 'Intern'] },
    { name: 'Júnior', aliases: ['Junior'] },
    { name: 'Pleno', aliases: ['Mid-level'] },
    { name: 'Sênior', aliases: ['Senior'] },
    { name: 'Especialista', aliases: ['Staff/Principal', 'Staff', 'Principal'] },
  ],
  contracts: [
    { name: 'CLT', aliases: [] },
    { name: 'PJ', aliases: [] },
    { name: 'Contrato', aliases: ['Contractor'] },
    { name: 'Freelance', aliases: ['Freelancer'] },
  ],
  workModels: [
    { name: 'Remoto', aliases: ['Remote'] },
    { name: 'Híbrido', aliases: ['Hybrid'] },
    { name: 'Presencial', aliases: ['On-site', 'Onsite'] },
  ],
  stacks: [
    { name: '.NET', aliases: ['dotnet', '.NET Core'] },
    { name: 'Apache Kafka', aliases: ['Kafka'] },
    { name: 'C#', aliases: ['CSharp'] },
    { name: 'Go', aliases: ['Golang'], caseSensitive: true },
    { name: 'Java', aliases: [] },
    { name: 'JavaScript', aliases: [] },
    { name: 'MySQL', aliases: ['MariaDB'] },
    { name: 'Node.js', aliases: ['NodeJS', 'Node'] },
    { name: 'PostgreSQL', aliases: ['Postgres'] },
    { name: 'Python', aliases: [] },
    { name: 'SQL', aliases: [] },
  ],
}
