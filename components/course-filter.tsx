'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Course {
  id: number
  fullname: string
  shortname: string
}

interface CourseFilterProps {
  courses: Course[]
  selectedCourseId: number | null
  totalStudents: number
}

export default function CourseFilter({ courses, selectedCourseId, totalStudents }: CourseFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const select = (courseId: number | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (courseId === null) {
      params.delete('curso')
    } else {
      params.set('curso', String(courseId))
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  if (courses.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        onClick={() => select(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          selectedCourseId === null
            ? 'bg-gray-900 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Todos ({totalStudents})
      </button>
      {courses.map((c) => (
        <button
          key={c.id}
          onClick={() => select(c.id)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedCourseId === c.id
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          {c.shortname || c.fullname}
        </button>
      ))}
    </div>
  )
}
