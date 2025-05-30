import type { UISheetElement } from '@genshin-optimizer/game-opt/sheet-ui'
import { wengineAsset } from '@genshin-optimizer/zzz/assets'
import type { WengineKey } from '@genshin-optimizer/zzz/consts'
import { buffs, conditionals } from '@genshin-optimizer/zzz/formula'
import { mappedStats } from '@genshin-optimizer/zzz/stats'
import { tagToTagField, trans } from '../../util'
import { PhaseWrapper } from '../components'

const key: WengineKey = 'RoaringRide'
const [chg, ch] = trans('wengine', key)
const dm = mappedStats.wengine[key]
const icon = wengineAsset(key, 'icon')
const cond = conditionals[key]
const buff = buffs[key]

const sheet: UISheetElement = {
  title: chg('phase'),
  img: icon,
  documents: [
    {
      type: 'text',
      text: (
        <PhaseWrapper wKey={key}>
          {(phase) => chg(`phaseDescs.${phase - 1}`)}
        </PhaseWrapper>
      ),
    },
    {
      type: 'conditional',
      conditional: {
        label: ch('cond_atk_'),
        metadata: cond.atk_,
        fields: [
          tagToTagField(buff.atk_.tag),
          {
            title: 'Duration', // TODO: L10n,
            fieldValue: dm.duration,
          },
        ],
      },
    },
    {
      type: 'conditional',
      conditional: {
        label: ch('cond_anomProf'),
        metadata: cond.anomProf,
        fields: [
          tagToTagField(buff.anomProf.tag),
          {
            title: 'Duration', // TODO: L10n,
            fieldValue: dm.duration,
          },
        ],
      },
    },
    {
      type: 'conditional',
      conditional: {
        label: ch('cond_anomBuildup_'),
        metadata: cond.anomBuildup_,
        fields: [
          tagToTagField(buff.anomBuildup_.tag),
          {
            title: 'Duration', // TODO: L10n,
            fieldValue: dm.duration,
          },
        ],
      },
    },
  ],
}

export default sheet
