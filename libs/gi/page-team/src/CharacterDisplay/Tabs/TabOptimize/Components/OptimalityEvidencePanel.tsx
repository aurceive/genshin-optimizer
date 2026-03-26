import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import VerifiedIcon from '@mui/icons-material/Verified'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Tooltip,
  Typography,
  styled,
} from '@mui/material'
import { useCallback, useState } from 'react'
import type { LapicSolveEvidence } from '../lapicBridge'

const Mono = styled('span')({ fontFamily: 'monospace', fontSize: '0.85em' })

/**
 * Collapsible panel displaying optimality evidence from the lapic
 * FinalOptimalityCert.  Shown after a lapic solve completes.
 */
export default function OptimalityEvidencePanel({
  evidence,
  tested,
  total,
}: {
  evidence: LapicSolveEvidence
  tested: number
  total: number
}) {
  const [expanded, setExpanded] = useState(false)
  const pruned = total - tested
  const prunePercent = total > 0 ? ((pruned / total) * 100).toFixed(1) : '0'

  const handleExport = useCallback(() => {
    if (!evidence.certificateJson) return
    const blob = new Blob([evidence.certificateJson], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lapic-certificate-${evidence.certificateId ?? 'final'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [evidence])

  const isVerified =
    evidence.certificateValidationStatus === 'validated' &&
    !evidence.dangerZoneDetected

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, v) => setExpanded(v)}
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        bgcolor: 'background.paper',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box display="flex" alignItems="center" gap={1}>
          {isVerified ? (
            <VerifiedIcon color="success" fontSize="small" />
          ) : (
            <WarningAmberIcon color="warning" fontSize="small" />
          )}
          <Typography variant="subtitle2">Optimality Evidence</Typography>
          <Chip
            size="small"
            label={isVerified ? 'Verified' : 'Review'}
            color={isVerified ? 'success' : 'warning'}
            variant="outlined"
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box display="flex" flexDirection="column" gap={0.5}>
          <Typography variant="body2">
            <strong>Search exhaustiveness:</strong>{' '}
            <Mono>
              {tested.toLocaleString()} / {total.toLocaleString()}
            </Mono>{' '}
            combinations evaluated ({prunePercent}% pruned by B&B)
          </Typography>
          <Typography variant="body2">
            <strong>Optimality gap:</strong>{' '}
            <Mono>{evidence.optimalityGap}</Mono>
          </Typography>
          {evidence.dangerZoneDetected && (
            <Typography variant="body2" color="warning.main">
              ⚠ Threshold-sensitive danger zone detected — bounds were near the
              incumbent threshold.
            </Typography>
          )}
          {evidence.exactReplayRequired && (
            <Typography variant="body2" color="warning.main">
              ⚠ Exact replay verification recommended for this result.
            </Typography>
          )}
          {evidence.certificateId && (
            <Typography variant="body2">
              <strong>Certificate:</strong>{' '}
              <Mono>{evidence.certificateId}</Mono>
              {evidence.certificateValidationStatus && (
                <>
                  {' '}
                  —{' '}
                  <Tooltip title="Validation status of the FinalOptimalityCert">
                    <Chip
                      size="small"
                      label={evidence.certificateValidationStatus}
                      color={
                        evidence.certificateValidationStatus === 'validated'
                          ? 'success'
                          : 'default'
                      }
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.75rem' }}
                    />
                  </Tooltip>
                </>
              )}
            </Typography>
          )}
          {evidence.certificateJson && (
            <Box mt={1}>
              <Button size="small" variant="outlined" onClick={handleExport}>
                Export Certificate (JSON)
              </Button>
            </Box>
          )}
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}
