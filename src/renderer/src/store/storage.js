import { Conf } from 'electron-conf/renderer'

const conf = new Conf()

// Custom storage object
export const storage = {
  getItem: async (name) => {
    return conf.get(name)
  },
  setItem: async (name, value) => {
    return conf.set(name, value)
  },
  removeItem: async (name) => {
    return conf.delete(name)
  }
}
