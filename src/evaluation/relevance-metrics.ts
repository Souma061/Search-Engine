export type RelevanceJudgment = {
    url: string;
    grade: number;
};

export type QueryMetrics = {
    reciprocalRank: number;
    recall: number;
    ndcg: number;
    relevantRanks: number[];
};

function dcg(grades: number[]): number {
    return grades.reduce(
        (total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
        0,
    );
}

/** Measures a ranked result list at a fixed cutoff against graded URL judgments. */
export function calculateQueryMetrics(
    resultUrls: string[],
    judgments: RelevanceJudgment[],
    cutoff = 10,
): QueryMetrics {
    const gradesByUrl = new Map(judgments.map((judgment) => [judgment.url, judgment.grade]));
    const topResults = resultUrls.slice(0, cutoff);
    const relevantRanks: number[] = [];
    const resultGrades = topResults.map((url, index) => {
        const grade = gradesByUrl.get(url) ?? 0;
        if (grade > 0) relevantRanks.push(index + 1);
        return grade;
    });
    const relevantCount = judgments.filter((judgment) => judgment.grade > 0).length;
    const idealGrades = judgments
        .map((judgment) => judgment.grade)
        .filter((grade) => grade > 0)
        .sort((a, b) => b - a)
        .slice(0, cutoff);
    const idealDcg = dcg(idealGrades);

    return {
        reciprocalRank: relevantRanks[0] ? 1 / relevantRanks[0] : 0,
        recall: relevantCount > 0 ? relevantRanks.length / relevantCount : 0,
        ndcg: idealDcg > 0 ? dcg(resultGrades) / idealDcg : 0,
        relevantRanks,
    };
}
