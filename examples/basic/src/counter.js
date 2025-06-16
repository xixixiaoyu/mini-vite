export function createCounter(initialValue = 0) {
  let count = initialValue;
  
  return {
    increment() {
      count++;
      console.log(`Counter incremented to: ${count}`);
    },
    
    decrement() {
      count--;
      console.log(`Counter decremented to: ${count}`);
    },
    
    getValue() {
      return count;
    },
    
    reset() {
      count = initialValue;
      console.log('Counter reset');
    }
  };
}
