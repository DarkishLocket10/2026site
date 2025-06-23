export default function ProjectCard({ project }) {
  return (
    <article className="rounded-lg overflow-hidden shadow hover:shadow-lg transition">
      <img src={project.img} alt={project.title} className="h-48 w-full object-cover" />
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-semibold">{project.title}</h3>
        <p className="text-sm text-gray-600 line-clamp-2">{project.summary}</p>
        <div className="flex gap-2 flex-wrap">
          {project.tags.map(t => (
            <span key={t} className="text-xs bg-gray-200 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
