import { generateObject } from 'ai'
import { z } from 'zod'

export const evalResponse = async (response: string) => {
    const result = await generateObject({
        model: 'openai/gpt-4o-mini',
        prompt: `Evaluate the following response: ${response}`,
        schema: z.object({
            response: z.string(),
            score: z.number(),
            feedback: z.string(),
        }),
    })

    return result.object;
}